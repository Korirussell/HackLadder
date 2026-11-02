"""Add-me requests (spec docs/superpowers/specs/2026-10-29-find-yourself-design.md).

Someone who isn't on HackLadder enters their Devpost username. ``lookup`` reads their public
portfolio and the projects on it, and sorts every hackathon they submitted to into a state:
rated (already crawled), queued (counts and will be crawled now), backlog (counts, beyond the
per-request cap: the daily crawl gets to it), or doesnt_count with a reason. ``queued_slugs`` is
what ``hl add crawl`` and the daily backfill crawl first; ``finish`` marks requests live once
their events are loaded and rated.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import timedelta
from typing import Any, Protocol

from psycopg.types.json import Jsonb

from hackladder.crawl.http import FetchFailedError, FetchResult
from hackladder.db import Connection
from hackladder.parse import ParseError, parse_gallery, parse_project, parse_user
from hackladder.parse.common import host_of

USERNAME = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
MAX_PROJECTS = 30
MAX_QUEUED = 20
MAX_PENDING = 50  # requests one `hl add lookup` without --username works through
PORTFOLIO_MAX_AGE = timedelta(hours=6)  # new projects show up; a cached copy is fine for this long


class Getter(Protocol):
    def get(self, url: str, max_age: timedelta | None = None) -> FetchResult: ...


@dataclass(frozen=True, slots=True)
class ScopeRow:
    slug: str
    title: str
    ends_on: str | None
    is_online: bool
    is_mlh: bool
    is_high_school: bool
    winners_announced: bool
    is_rated: bool
    loaded: bool  # has projects in the database


@dataclass(frozen=True, slots=True)
class EventState:
    slug: str
    title: str
    ends_on: str | None
    state: str  # rated | queued | backlog | loaded | doesnt_count
    reason: str | None = None


def classify(row: ScopeRow | None) -> tuple[str, str | None]:
    """An event's state for someone who submitted to it, and why it doesn't count if it doesn't."""
    reason: str | None = None
    if row is None:
        reason = "not on HackLadder"
    elif row.is_high_school:
        reason = "high school"
    elif not row.is_rated:
        reason = "online" if row.is_online else "not an MLH event" if not row.is_mlh else "excluded"
    elif not row.winners_announced:
        reason = "winners not announced"
    if reason:
        return "doesnt_count", reason
    assert row is not None
    return ("rated", None) if row.loaded else ("queued", None)


def portfolio_projects(getter: Getter, username: str) -> list[str] | None:
    """Project slugs on a Devpost portfolio, newest first, at most MAX_PROJECTS; None if there's
    no such user. Portfolios use the hackathon gallery's markup, so parse_gallery reads them."""
    slugs: list[str] = []
    for page in (1, 2):
        url = f"https://devpost.com/{username}" + (f"?page={page}" if page > 1 else "")
        got = getter.get(url, max_age=PORTFOLIO_MAX_AGE)
        if page == 1 and got.status == 404:
            return None
        if got.status != 200:
            raise FetchFailedError(url, got.status, f"HTTP {got.status}", 1)
        if page == 1:
            try:
                parse_user(got.text)  # devpost.com/software and the like aren't people
            except ParseError:
                return None
        gallery = parse_gallery(got.text)
        slugs += [e.slug for e in gallery.entries]
        if not gallery.has_next or len(slugs) >= MAX_PROJECTS:
            break
    return slugs[:MAX_PROJECTS]


def submitted_events(getter: Getter, project_slugs: list[str]) -> dict[str, str]:
    """Devpost subdomain -> hackathon title, for every hackathon these projects were submitted to."""
    events: dict[str, str] = {}
    for slug in project_slugs:
        got = getter.get(f"https://devpost.com/software/{slug}")
        if got.status != 200:
            continue
        try:
            page = parse_project(got.text, "devpost.com")
        except ParseError:
            continue
        for s in page.submissions:
            host = host_of(s.hackathon_url)
            if host.endswith(".devpost.com"):
                events.setdefault(host.removesuffix(".devpost.com"), s.hackathon_title)
    return events


_SCOPE = """
select h.slug, h.title, h.ends_on::text, h.is_online, h.is_mlh, h.is_high_school, h.winners_announced,
       s.is_rated, exists (select 1 from public.projects p where p.hackathon_id = h.id)
from public.hackathons h
join public.hackathon_scope s on s.hackathon_id = h.id
where h.slug = any(%s)
"""

_RATED_PERSON = """
select p.slug from public.accounts a
join public.people p on p.id = a.person_id
join public.ratings r on r.person_id = p.id
where a.source = 'devpost' and lower(a.source_id) = lower(%s) and not p.hidden
"""


def _set(
    conn: Connection,
    request_id: int,
    status: str,
    *,
    events: list[dict[str, Any]] | None = None,
    person_slug: str | None = None,
    failed: bool = False,
) -> str:
    conn.execute(
        "update public.add_requests set status = %s, events = coalesce(%s, events),"
        " person_slug = coalesce(%s, person_slug), attempts = attempts + %s, updated_at = now()"
        " where id = %s",
        (status, Jsonb(events) if events is not None else None, person_slug, int(failed), request_id),
    )
    conn.commit()
    return status


def lookup(conn: Connection, getter: Getter, request_id: int, username: str) -> str:
    """Work out one request's events; returns its new status. Any failure after the request is
    marked looking_up leaves it `failed` (never stuck), and unexpected errors are re-raised."""
    if not USERNAME.fullmatch(username):
        raise ValueError(f"not a Devpost username: {username!r}")
    _set(conn, request_id, "looking_up")
    try:
        return _lookup(conn, getter, request_id, username)
    except (FetchFailedError, ParseError):
        conn.rollback()
        return _set(conn, request_id, "failed", failed=True)
    except Exception:
        conn.rollback()
        _set(conn, request_id, "failed", failed=True)
        raise


def _lookup(conn: Connection, getter: Getter, request_id: int, username: str) -> str:
    projects = portfolio_projects(getter, username)
    if projects is None:
        return _set(conn, request_id, "not_found")
    events = submitted_events(getter, projects)

    rows = {r[0]: ScopeRow(*r) for r in conn.execute(_SCOPE, (list(events),)).fetchall()}
    states: list[EventState] = []
    queued = 0
    for slug, title in events.items():
        row = rows.get(slug)
        state, reason = classify(row)
        if state == "queued":
            queued += 1
            if queued > MAX_QUEUED:
                state = "backlog"
        states.append(
            EventState(slug, row.title if row else title, row.ends_on if row else None, state, reason)
        )
    states.sort(key=lambda e: e.ends_on or "", reverse=True)

    person = conn.execute(_RATED_PERSON, (username,)).fetchone()
    person_slug = str(person[0]) if person else None
    # Already on the board with nothing new to crawl: say so, with their profile.
    status = "crawling" if queued else "already_here" if person_slug else "nothing_counts"
    return _set(conn, request_id, status, events=[asdict(e) for e in states], person_slug=person_slug)


def pending_lookups(conn: Connection, username: str | None) -> list[tuple[int, str]]:
    """Requests waiting for a lookup: that username's latest, or the oldest MAX_PENDING."""
    if username is not None:
        rows = conn.execute(
            "select id, username from public.add_requests"
            " where lower(username) = lower(%s) and status = 'queued'"
            " order by created_at desc, id desc limit 1",
            (username,),
        ).fetchall()
    else:
        rows = conn.execute(
            "select id, username from public.add_requests"
            " where status = 'queued' order by created_at limit %s",
            (MAX_PENDING,),
        ).fetchall()
    return [(int(r[0]), str(r[1])) for r in rows]


def queued_slugs(conn: Connection) -> list[str]:
    """Events waiting on an open request: `hl add crawl` and the daily backfill crawl these first."""
    rows = conn.execute(
        "select distinct e ->> 'slug' from public.add_requests r"
        " cross join lateral jsonb_array_elements(r.events) e"
        " where r.status = 'crawling' and e ->> 'state' = 'queued'"
    ).fetchall()
    return sorted(str(r[0]) for r in rows)


def mark_loaded(conn: Connection) -> None:
    """Queued events that now have projects become loaded."""
    conn.execute(
        """
        update public.add_requests r set updated_at = now(), events = coalesce((
          select jsonb_agg(case when e ->> 'state' = 'queued' and exists (
                   select 1 from public.projects p join public.hackathons h on h.id = p.hackathon_id
                   where h.slug = e ->> 'slug')
                 then jsonb_set(e, '{state}', '"loaded"') else e end order by x.ord)
          from jsonb_array_elements(r.events) with ordinality x (e, ord)), '[]'::jsonb)
        where r.status = 'crawling'
        """
    )
    conn.commit()


def finish(conn: Connection) -> tuple[int, int]:
    """After a rating run: requests with nothing left queued go live (their person is rated) or,
    if the crawl found them on none of those events, nothing_counts. Returns (live, nothing)."""
    mark_loaded(conn)
    open_done = (
        "r.status = 'crawling' and not exists"
        " (select 1 from jsonb_array_elements(r.events) e where e ->> 'state' = 'queued')"
    )
    live = conn.execute(
        "update public.add_requests r set status = 'live', person_slug = p.slug, updated_at = now()"
        " from public.accounts a join public.people p on p.id = a.person_id"
        " join public.ratings rt on rt.person_id = p.id"
        f" where {open_done} and a.source = 'devpost' and lower(a.source_id) = lower(r.username)"
        " returning r.id"
    ).fetchall()
    nothing = conn.execute(
        f"update public.add_requests r set status = 'nothing_counts', updated_at = now() where {open_done}"
        " returning r.id"
    ).fetchall()
    conn.commit()
    return len(live), len(nothing)
