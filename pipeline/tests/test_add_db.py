"""Add-me lookup against a migrated database (pytest -m db)."""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import psycopg
import pytest
from conftest import read_fixture

from hackladder.add import finish, lookup, mark_loaded, pending_lookups, queued_slugs
from hackladder.crawl.http import FetchFailedError, FetchResult
from hackladder.db import set_checkpoint

pytestmark = [
    pytest.mark.db,
    pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="needs DATABASE_URL"),
]

PORTFOLIO = read_fixture("user/dylanjpaulson.html")  # one project: scratchml


@pytest.fixture
def conn() -> Iterator[psycopg.Connection[Any]]:
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c
        c.rollback()
        c.execute("delete from public.add_requests where username like 't-add-%'")
        c.execute(
            "delete from public.crawl_checkpoints where job in"
            " (select 'event:' || id from public.hackathons where slug like 't-add-%')"
        )
        c.execute("delete from public.hackathons where slug like 't-add-%'")
        c.execute(
            "delete from public.ratings where person_id in"
            " (select id from public.people where slug like 't-add-%')"
        )
        c.execute("delete from public.accounts where source_id like 't-add-%'")
        c.execute("delete from public.people where slug like 't-add-%'")
        c.commit()


def project_page(*hosts: str) -> str:
    """The smallest project page parse_project accepts, submitted to these hackathons.

    Mirrors the selectors in parse/project.py: #app-title, and one li per event under
    #submissions ul.software-list-with-thumbnail, with the event link in .software-list-content.
    """
    subs = "".join(
        '<li><div class="software-list-content">'
        f'<p><a href="https://{h}.devpost.com/">{h} title</a></p></div></li>'
        for h in hosts
    )
    return (
        '<html><body><div id="app-title">Scratch ML</div>'
        f'<div id="submissions"><ul class="software-list-with-thumbnail">{subs}</ul></div>'
        "</body></html>"
    )


class Pages:
    def __init__(self, pages: dict[str, str]) -> None:
        self.pages = pages

    def get(self, url: str, max_age: timedelta | None = None) -> FetchResult:
        text = self.pages.get(url)
        return FetchResult(url, 200 if text is not None else 404, text or "", 0.0)


def one(row: tuple[Any, ...] | None) -> Any:
    assert row is not None
    return row[0]


def hackathon(conn: psycopg.Connection[Any], slug: str, **kw: object) -> int:
    cols = {
        "source_id": slug,
        "slug": slug,
        "title": slug.title(),
        "url": f"https://{slug}.devpost.com/",
        "ends_on": "2026-03-01",
        "is_mlh": True,
        "winners_announced": True,
    } | kw
    row = conn.execute(
        f"insert into public.hackathons ({', '.join(cols)})"
        f" values ({', '.join(['%s'] * len(cols))}) returning id",
        list(cols.values()),
    ).fetchone()
    assert row is not None
    return int(row[0])


def test_lookup_sorts_each_event(conn: psycopg.Connection[Any]) -> None:
    hackathon(conn, "t-add-counts")
    hackathon(conn, "t-add-online", is_online=True)
    hackathon(conn, "t-add-notmlh", is_mlh=False)
    conn.commit()
    rid = one(
        conn.execute(
            "insert into public.add_requests (username) values ('t-add-dylan') returning id"
        ).fetchone()
    )
    conn.commit()
    pages = Pages(
        {
            "https://devpost.com/t-add-dylan": PORTFOLIO,
            "https://devpost.com/software/scratchml": project_page(
                "t-add-counts", "t-add-online", "t-add-notmlh", "t-add-unknown"
            ),
        }
    )
    assert lookup(conn, pages, rid, "t-add-dylan") == "crawling"
    events = one(conn.execute("select events from public.add_requests where id = %s", (rid,)).fetchone())
    by_slug = {e["slug"]: (e["state"], e["reason"]) for e in events}
    assert by_slug == {
        "t-add-counts": ("queued", None),
        "t-add-online": ("doesnt_count", "online"),
        "t-add-notmlh": ("doesnt_count", "not an MLH event"),
        "t-add-unknown": ("doesnt_count", "not on HackLadder"),
    }


def test_lookup_of_a_missing_user(conn: psycopg.Connection[Any]) -> None:
    rid = one(
        conn.execute(
            "insert into public.add_requests (username) values ('t-add-ghost') returning id"
        ).fetchone()
    )
    conn.commit()
    assert lookup(conn, Pages({}), rid, "t-add-ghost") == "not_found"
    assert all(u != "t-add-ghost" for _, u in pending_lookups(conn, None))  # no longer waiting


def test_pending_lookups_takes_the_latest_for_a_username(conn: psycopg.Connection[Any]) -> None:
    conn.execute("insert into public.add_requests (username) values ('t-add-zed'), ('t-add-zed')")
    conn.commit()
    latest = one(
        conn.execute("select max(id) from public.add_requests where username = 't-add-zed'").fetchone()
    )
    assert pending_lookups(conn, "T-ADD-ZED") == [(latest, "t-add-zed")]


def request(conn: psycopg.Connection[Any], username: str) -> int:
    rid = one(
        conn.execute(
            "insert into public.add_requests (username) values (%s) returning id", (username,)
        ).fetchone()
    )
    conn.commit()
    return int(rid)


def state_of(conn: psycopg.Connection[Any], rid: int) -> tuple[str, int, str | None, list[dict[str, Any]]]:
    row = conn.execute(
        "select status, attempts, person_slug, events from public.add_requests where id = %s", (rid,)
    ).fetchone()
    assert row is not None
    return row[0], row[1], row[2], row[3]


def rated_person(conn: psycopg.Connection[Any], username: str) -> None:
    pid = one(
        conn.execute(
            "insert into public.people (slug, display_name) values (%s, 'T Add') returning id",
            (username,),
        ).fetchone()
    )
    conn.execute(
        "insert into public.accounts (source_id, display_name, person_id) values (%s, 'T Add', %s)",
        (username, pid),
    )
    conn.execute(
        "insert into public.ratings (person_id, mu, sigma, score, events, placements, grand_prizes,"
        " provisional) values (%s, 25, 8, 1000, 1, 0, 0, true)",
        (pid,),
    )
    conn.commit()


def test_lookup_caps_queued_events_at_twenty(conn: psycopg.Connection[Any]) -> None:
    slugs = [f"t-add-cap{i:02d}" for i in range(21)]
    for slug in slugs:
        hackathon(conn, slug)
    conn.commit()
    rid = request(conn, "t-add-capper")
    pages = Pages(
        {
            "https://devpost.com/t-add-capper": PORTFOLIO,
            "https://devpost.com/software/scratchml": project_page(*slugs),
        }
    )
    assert lookup(conn, pages, rid, "t-add-capper") == "crawling"
    events = state_of(conn, rid)[3]
    states = [e["state"] for e in events]
    assert states.count("queued") == 20
    assert states.count("backlog") == 1


def test_lookup_failure_is_recorded(conn: psycopg.Connection[Any]) -> None:
    class Down:
        def get(self, url: str, max_age: timedelta | None = None) -> FetchResult:
            raise FetchFailedError(url, 503, "HTTP 503", 1)

    rid = request(conn, "t-add-down")
    assert lookup(conn, Down(), rid, "t-add-down") == "failed"
    assert state_of(conn, rid)[:2] == ("failed", 1)


def test_lookup_of_a_rated_user_with_nothing_new(conn: psycopg.Connection[Any]) -> None:
    pid = hackathon(conn, "t-add-done")
    conn.execute(
        "insert into public.projects (source_id, hackathon_id, title) values ('t-add-p', %s, 'P')", (pid,)
    )
    rated_person(conn, "t-add-known")
    rid = request(conn, "t-add-known")
    pages = Pages(
        {
            "https://devpost.com/t-add-known": PORTFOLIO,
            "https://devpost.com/software/scratchml": project_page("t-add-done"),
        }
    )
    assert lookup(conn, pages, rid, "t-add-known") == "already_here"
    status, _, person_slug, events = state_of(conn, rid)
    assert (status, person_slug) == ("already_here", "t-add-known")
    assert [e["state"] for e in events] == ["rated"]


def test_lookup_where_nothing_counts(conn: psycopg.Connection[Any]) -> None:
    hackathon(conn, "t-add-jam", is_online=True)
    rid = request(conn, "t-add-nobody")
    pages = Pages(
        {
            "https://devpost.com/t-add-nobody": PORTFOLIO,
            "https://devpost.com/software/scratchml": project_page("t-add-jam"),
        }
    )
    assert lookup(conn, pages, rid, "t-add-nobody") == "nothing_counts"
    assert state_of(conn, rid)[2] is None


def test_lookup_rejects_a_bad_username(conn: psycopg.Connection[Any]) -> None:
    rid = request(conn, "t-add-bad")
    with pytest.raises(ValueError, match="username"):
        lookup(conn, Pages({}), rid, "../software")
    assert state_of(conn, rid)[0] == "queued"


def test_finish_marks_loaded_events_and_goes_live(conn: psycopg.Connection[Any]) -> None:
    hid = hackathon(conn, "t-add-done")
    conn.execute(
        "insert into public.add_requests (username, status, events) values ('t-add-amy', 'crawling', %s)",
        ('[{"slug": "t-add-done", "title": "Done", "ends_on": null, "state": "queued", "reason": null}]',),
    )
    conn.commit()
    assert "t-add-done" in queued_slugs(conn)
    # The crawl loads a project and the rating run rates its member.
    pid = one(
        conn.execute(
            "insert into public.people (slug, display_name) values ('t-add-amy', 'Amy') returning id"
        ).fetchone()
    )
    acc = one(
        conn.execute(
            "insert into public.accounts (source, source_id, display_name, person_id)"
            " values ('devpost', 't-add-amy', 'Amy', %s) returning id",
            (pid,),
        ).fetchone()
    )
    prj = one(
        conn.execute(
            "insert into public.projects (source, source_id, hackathon_id, title)"
            " values ('devpost', 't-add-p', %s, 'P') returning id",
            (hid,),
        ).fetchone()
    )
    conn.execute("insert into public.project_members (project_id, account_id) values (%s, %s)", (prj, acc))
    set_checkpoint(conn, f"event:{hid}", {"done": True})
    conn.execute(
        "insert into public.ratings (person_id, mu, sigma, score, events, placements, grand_prizes,"
        " last_event_on, percentile, provisional)"
        " values (%s, 25, 8, 1000, 1, 0, 0, current_date, null, true)",
        (pid,),
    )
    conn.commit()
    assert finish(conn) == (1, 0)
    got = conn.execute(
        "select status, person_slug, events from public.add_requests where username = 't-add-amy'"
    ).fetchone()
    assert got is not None
    status, slug, events = got
    assert (status, slug, events[0]["state"]) == ("live", "t-add-amy", "loaded")
    assert "t-add-done" not in queued_slugs(conn)


def crawling(conn: psycopg.Connection[Any], username: str, events: list[dict[str, Any]]) -> None:
    conn.execute(
        "insert into public.add_requests (username, status, events) values (%s, 'crawling', %s)",
        (username, json.dumps(events)),
    )
    conn.commit()


def ev(slug: str, state: str) -> dict[str, Any]:
    return {"slug": slug, "title": slug, "ends_on": None, "state": state, "reason": None}


def request_row(conn: psycopg.Connection[Any], username: str) -> tuple[str, list[dict[str, Any]]]:
    got = conn.execute(
        "select status, events from public.add_requests where username = %s", (username,)
    ).fetchone()
    assert got is not None
    return got[0], got[1]


def test_half_crawled_event_stays_queued(conn: psycopg.Connection[Any]) -> None:
    hid = hackathon(conn, "t-add-half")
    conn.execute(
        "insert into public.projects (source, source_id, hackathon_id, title)"
        " values ('devpost', 't-add-hp', %s, 'P')",
        (hid,),
    )
    crawling(conn, "t-add-bob", [ev("t-add-half", "queued")])
    assert finish(conn) == (0, 0)
    status, events = request_row(conn, "t-add-bob")
    assert (status, events[0]["state"]) == ("crawling", "queued")


def test_finished_empty_event_loads_and_request_gets_nothing_counts(conn: psycopg.Connection[Any]) -> None:
    hid = hackathon(conn, "t-add-empty")
    set_checkpoint(conn, f"event:{hid}", {"done": True})
    crawling(conn, "t-add-cy", [ev("t-add-empty", "queued")])
    assert finish(conn) == (0, 1)
    status, events = request_row(conn, "t-add-cy")
    assert (status, events[0]["state"]) == ("nothing_counts", "loaded")


def test_mark_loaded_keeps_order_and_other_states(conn: psycopg.Connection[Any]) -> None:
    hid = hackathon(conn, "t-add-ord")
    set_checkpoint(conn, f"event:{hid}", {"done": True})
    crawling(conn, "t-add-dee", [ev("a", "doesnt_count"), ev("t-add-ord", "queued"), ev("z", "backlog")])
    mark_loaded(conn)
    _, events = request_row(conn, "t-add-dee")
    assert [(e["slug"], e["state"]) for e in events] == [
        ("a", "doesnt_count"),
        ("t-add-ord", "loaded"),
        ("z", "backlog"),
    ]
