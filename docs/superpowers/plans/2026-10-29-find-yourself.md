# Find Yourself and Add-Me Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "search your name" the home page's main action, and let anyone who isn't found enter their Devpost username to have the hackathons that count crawled and rated the same day.

**Architecture:**
- **Web:** a new `add_requests` table, reached only through two security-definer RPCs, holds one row per request. The site writes a request and dispatches a GitHub workflow.
- **Pipeline:** Python reads the public Devpost portfolio, classifies each submitted hackathon against `hackathon_scope`, crawls the queued ones (inside the `pipeline-db` lock), rates and marks the request live.
- **Status page:** checks the request every 4 seconds.
- **Daily backfill:** crawls requested events first, so requests made while it holds the lock are still served the same day.

**Tech Stack:** Postgres/Supabase (plpgsql, pgTAP), Python 3.12 (psycopg 3, BeautifulSoup, typer, pytest), GitHub Actions, Next.js 16 with Cache Components (React 19, Tailwind v4, vitest).

**Spec:** `docs/superpowers/specs/2026-10-29-find-yourself-design.md`. This plan deviates from it in three places, and Task 8 folds them back into the spec:
- **(a) Backlog state:** queued events beyond the first 20 get state `backlog` ("queued for the daily crawl"), since the backfill reaches every in-scope event anyway.
- **(b) Shared crawl:** `hl add crawl` and `hl add finish` act on all `crawling` requests, not one username. GitHub keeps only one pending run per concurrency group and cancels the others, so a run must serve everyone queued behind it.
- **(c) Pending fallback:** `hl add lookup` without `--username` processes up to 50 `queued` requests. The daily crawl runs it first, so a request whose dispatch failed is still looked up.

## Global Constraints

- **Username rule:** `^[A-Za-z0-9_-]{1,40}$`, enforced by the database, the server action, the workflow and the pipeline.
- **Request statuses:** `queued`, `looking_up`, `already_here`, `crawling`, `live`, `nothing_counts`, `not_found`, `failed`.
- **Event states:** `rated`, `queued`, `backlog`, `loaded`, `doesnt_count`.
- **Doesn't-count reasons:** `not on HackLadder`, `high school`, `online`, `not an MLH event`, `excluded`, `winners not announced`.
- **Limits:**
  - at most 30 portfolio projects per lookup;
  - at most 20 events queued per request;
  - the same username dedupes within 24 hours, except after `failed`;
  - at most 200 requests site-wide per rolling 24 hours (error `add_requests_busy`).
- **Polling:** every 4,000 ms while the status is `queued`, `looking_up` or `crawling`, stopping after 10 minutes.
- **Privacy (§9):** read only public Devpost pages through the existing polite fetcher. Store nothing but the username.
- **No production writes:** never apply migrations to production. The owner applies them (CLAUDE.md §15 workflow). Test against the local `hl-pg` container.
- **Comments:** match the repo's style (short, cite § sections, explain why).
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Local test commands (this machine)

The sandbox blocks localhost. Postgres runs in Docker container `hl-pg`.

```bash
# apply a migration to the local DB
docker exec -i hl-pg psql -q -U postgres -h localhost -v ON_ERROR_STOP=1 -1 < supabase/migrations/<file>.sql
# run one pgTAP file
docker exec -i hl-pg psql -q -U postgres -h localhost -At < supabase/tests/database/<file>.test.sql
# pipeline unit tests (from pipeline/)
uv run pytest -q
# pipeline DB tests (from repo root, hackladder/)
MSYS_NO_PATHCONV=1 docker run --rm --network container:hl-pg -v "$(pwd -W)/pipeline:/src:ro" -w /src \
  -e UV_PROJECT_ENVIRONMENT=/tmp/venv -e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  ghcr.io/astral-sh/uv:0.9.5-python3.12-bookworm-slim sh -c "uv sync -q --locked && uv run --no-sync pytest -q -m db -p no:cacheprovider"
# web (from apps/web/)
pnpm -s typecheck && pnpm -s lint && pnpm -s test && pnpm -s build
```

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261030000100_add_requests.sql` | table, indexes, RLS, `request_add`, `add_request_status` |
| `supabase/tests/database/add_requests.test.sql` | pgTAP for the above |
| `pipeline/src/hackladder/add.py` | lookup (portfolio, classify, write), the queued-slug list, the mark-loaded step and finish |
| `pipeline/src/hackladder/crawl/events.py` | `prioritize()`: requested slugs first in the backfill |
| `pipeline/src/hackladder/cli.py` | `hl add lookup / crawl / finish` |
| `pipeline/tests/test_add.py` | unit tests (classify, portfolio parsing, prioritize) |
| `pipeline/tests/test_add_db.py` | DB tests (lookup, finish) |
| `pipeline/tests/fixtures/user/jemsbhai.html` (+ manifest entry) | two-page portfolio fixture |
| `.github/workflows/add-hacker.yml` | lookup job, then crawl, rate, revalidate and finish under `pipeline-db` |
| `.github/workflows/crawl-events.yml` | pending lookups before the crawl; finish after rating |
| `apps/web/lib/add.ts` | pure: username rule, href, status copy, polling rule |
| `apps/web/lib/add-data.ts` | server-only: `getAddRequest()` |
| `apps/web/lib/github.ts` | server-only: `dispatchWorkflow()` (moved from admin) |
| `apps/web/app/(site)/add/page.tsx`, `add-form.tsx`, `actions.ts` | the form and `requestAdd` |
| `apps/web/app/(site)/add/[username]/page.tsx`, `status-view.tsx` | status page and poller |
| `apps/web/app/api/add/[username]/route.ts` | uncached status JSON for polling |
| `apps/web/tests/add.test.ts` | tests for `lib/add.ts` |
| `apps/web/app/(site)/page.tsx`, `components/site/search-box.tsx`, `components/site/search-window.tsx`, `app/(site)/search/page.tsx`, `app/robots.ts` | hero, no-results links, robots |

---

### Task 1: `add_requests` table and RPCs

**Files:**
- Create: `supabase/migrations/20261030000100_add_requests.sql`
- Create: `supabase/tests/database/add_requests.test.sql`

**Interfaces:**
- Produces:
  - table `public.add_requests(id, username, status, events jsonb, person_slug, attempts, created_at, updated_at)`;
  - `public.request_add(p_username text) returns table (username text, status text, is_new boolean)`;
  - `public.add_request_status(p_username text) returns jsonb` (`{username, status, events, person_slug, updated_at}`, or null).

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- add_requests: anyone can ask to be added by Devpost username; the pipeline does the rest
-- (spec 2026-10-29-find-yourself). Run with: supabase test db. Invented data, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select throws_ok($$ select * from public.request_add('not a username') $$, '22023', 'add_requests_bad_username',
                 'usernames are checked');
select is((select is_new from public.request_add('t-ar-alice')), true, 'a first request is new');
select is((select is_new from public.request_add('T-AR-ALICE')), false, 'the same username (any case) within 24 hours is not');
select is((select count(*)::int from public.add_requests where lower(username) = 't-ar-alice'), 1, 'and adds no row');

update public.add_requests set status = 'failed' where username = 't-ar-alice';
select is((select is_new from public.request_add('t-ar-alice')), true, 'after a failure, asking again starts over');

select is((public.add_request_status('t-ar-alice') ->> 'status'), 'queued', 'status returns the latest request');
select is(public.add_request_status('t-ar-nobody'), null, 'and null for a username never asked about');

insert into public.add_requests (username) select 't-ar-fill-' || g from generate_series(1, 200) g;
select throws_ok($$ select * from public.request_add('t-ar-bob') $$, '54000', 'add_requests_busy',
                 'at most 200 requests a day across the site');

set local role anon;
select throws_ok($$ select * from public.add_requests $$, '42501', null, 'anon cannot read the table directly');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `docker exec -i hl-pg psql -q -U postgres -h localhost -At < supabase/tests/database/add_requests.test.sql`
Expected: errors such as `function public.request_add(unknown) does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- "Add me" requests (spec docs/superpowers/specs/2026-10-29-find-yourself-design.md): someone who
-- isn't found enters their Devpost username; the pipeline reads their public portfolio, queues the
-- hackathons that count, crawls and rates them, and marks the request live. Only the two functions
-- below and the pipeline (postgres) touch the table.

create table public.add_requests (
  id          bigint generated always as identity primary key,
  username    text not null check (username ~ '^[A-Za-z0-9_-]{1,40}$'),
  status      text not null default 'queued'
              check (status in ('queued', 'looking_up', 'already_here', 'crawling', 'live',
                                'nothing_counts', 'not_found', 'failed')),
  events      jsonb not null default '[]',  -- [{slug, title, ends_on, state, reason}]
  person_slug text,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index add_requests_by_username on public.add_requests (lower(username), created_at desc);
create index add_requests_open on public.add_requests (status) where status in ('queued', 'crawling');

alter table public.add_requests enable row level security;
revoke all on public.add_requests from anon, authenticated;

create function public.request_add(p_username text)
returns table (username text, status text, is_new boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  u text := btrim(p_username);
  r public.add_requests;
begin
  if u is null or u !~ '^[A-Za-z0-9_-]{1,40}$' then
    raise exception 'add_requests_bad_username' using errcode = '22023';
  end if;
  -- One request per username a day, so reloading or sharing the status page doesn't re-crawl.
  select * into r from public.add_requests a
  where lower(a.username) = lower(u) and a.created_at > now() - interval '24 hours' and a.status <> 'failed'
  order by a.created_at desc limit 1;
  if found then
    return query select r.username, r.status, false;
    return;
  end if;
  if (select count(*) from public.add_requests a where a.created_at > now() - interval '24 hours') >= 200 then
    raise exception 'add_requests_busy' using errcode = '54000';
  end if;
  insert into public.add_requests (username) values (u) returning * into r;
  return query select r.username, r.status, true;
end
$$;

create function public.add_request_status(p_username text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('username', a.username, 'status', a.status, 'events', a.events,
                            'person_slug', a.person_slug, 'updated_at', a.updated_at)
  from public.add_requests a
  where lower(a.username) = lower(btrim(p_username))
  order by a.created_at desc
  limit 1
$$;

revoke all on function public.request_add(text), public.add_request_status(text) from public;
grant execute on function public.request_add(text), public.add_request_status(text) to anon, authenticated;
```

- [ ] **Step 4: Apply locally and run the test**

Run:
```bash
docker exec -i hl-pg psql -q -U postgres -h localhost -v ON_ERROR_STOP=1 -1 < supabase/migrations/20261030000100_add_requests.sql
docker exec -i hl-pg psql -q -U postgres -h localhost -At < supabase/tests/database/add_requests.test.sql
```
Expected: `1..9` and `ok 1` through `ok 9`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261030000100_add_requests.sql supabase/tests/database/add_requests.test.sql
git commit -m "feat(db): add_requests with request_add and add_request_status"
```

---

### Task 2: Lookup: portfolio → events → states

**Files:**
- Create: `pipeline/src/hackladder/add.py`
- Create: `pipeline/tests/test_add.py`
- Create: `pipeline/tests/test_add_db.py`
- Create: `pipeline/tests/fixtures/user/jemsbhai.html` (copy from `C:\Users\RUSSK087\AppData\Local\Temp\claude\C--Users-RUSSK087-Coding-HackLadder\2e863fb7-e45b-4040-bcd1-c5e94333c47c\scratchpad\portfolio\jemsbhai.html`, fetched 2026-10-29 through `PoliteClient`)
- Modify: `pipeline/tests/fixtures/manifest.json` (add the entry)

**Interfaces:**
- Consumes: the table from Task 1; `parse_gallery`, `parse_user`, `parse_project`, `ParseError` (`hackladder.parse`); `host_of` (`hackladder.parse.common`); `FetchResult`, `FetchFailedError` (`hackladder.crawl.http`).
- Produces (in `hackladder.add`):
  - `USERNAME: re.Pattern`;
  - `Getter` (Protocol: `get(url, max_age=None) -> FetchResult`);
  - `ScopeRow`;
  - `classify(row: ScopeRow | None) -> tuple[str, str | None]`;
  - `portfolio_projects(getter, username) -> list[str] | None`;
  - `lookup(conn, getter, request_id: int, username: str) -> str` (the new status);
  - `pending_lookups(conn, username: str | None) -> list[tuple[int, str]]`.

- [ ] **Step 1: Add the fixture**

Copy the file. Then add this entry to `pipeline/tests/fixtures/manifest.json`, after `"user/dylanjpaulson.html"` and in the same shape as the other `user/` entries:
```json
  "user/jemsbhai.html": {
    "url": "https://devpost.com/jemsbhai",
    "why": "portfolio with a second page (24 projects on page 1)",
    "fetched_at": "2026-10-29T00:00:00+00:00"
  },
```

- [ ] **Step 2: Write the failing unit tests** (`pipeline/tests/test_add.py`)

```python
"""Add-me lookup: pure parts (spec 2026-10-29-find-yourself)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from conftest import read_fixture

from hackladder.add import ScopeRow, classify, portfolio_projects
from hackladder.crawl.http import FetchResult


def row(**kw: object) -> ScopeRow:
    base = dict(slug="e", title="E", ends_on="2026-01-01", is_online=False, is_mlh=True, is_high_school=False,
                winners_announced=True, is_rated=True, loaded=False)
    return ScopeRow(**(base | kw))  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("r", "expected"),
    [
        (None, ("doesnt_count", "not on HackLadder")),
        (row(is_high_school=True, is_rated=False), ("doesnt_count", "high school")),
        (row(is_online=True, is_rated=False), ("doesnt_count", "online")),
        (row(is_mlh=False, is_rated=False), ("doesnt_count", "not an MLH event")),
        (row(is_rated=False), ("doesnt_count", "excluded")),
        (row(winners_announced=False), ("doesnt_count", "winners not announced")),
        (row(loaded=True), ("rated", None)),
        (row(), ("queued", None)),
        (row(is_online=True), ("queued", None)),  # an admin-included online event counts
    ],
)
def test_classify(r: ScopeRow | None, expected: tuple[str, str | None]) -> None:
    assert classify(r) == expected


class Pages:
    def __init__(self, pages: dict[str, str]) -> None:
        self.pages, self.requested = pages, list[str]()

    def get(self, url: str, max_age: timedelta | None = None) -> FetchResult:
        self.requested.append(url)
        text = self.pages.get(url)
        return FetchResult(url, 200 if text is not None else 404, text or "", 0.0)


def test_portfolio_reads_two_pages_and_caps_at_30() -> None:
    page1 = read_fixture("user/jemsbhai.html")
    pages = Pages({"https://devpost.com/jemsbhai": page1, "https://devpost.com/jemsbhai?page=2": page1})
    slugs = portfolio_projects(pages, "jemsbhai")
    assert slugs is not None and len(slugs) == 30 and slugs[0] == "vamped"
    assert pages.requested == ["https://devpost.com/jemsbhai", "https://devpost.com/jemsbhai?page=2"]


def test_portfolio_of_a_missing_user_is_none() -> None:
    assert portfolio_projects(Pages({}), "nobody-here") is None


def test_a_devpost_page_that_isnt_a_user_is_none() -> None:
    # devpost.com/software exists but is the global project gallery, not a portfolio
    gallery = "<html><body><div class='gallery-item'></div></body></html>"
    assert portfolio_projects(Pages({"https://devpost.com/software": gallery}), "software") is None
```

- [ ] **Step 3: Run them to make sure they fail**

Run (from `pipeline/`): `uv run pytest -q tests/test_add.py`
Expected: `ModuleNotFoundError: No module named 'hackladder.add'`.

- [ ] **Step 4: Write `pipeline/src/hackladder/add.py`**

```python
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
    if row is None:
        return "doesnt_count", "not on HackLadder"
    if row.is_high_school:
        return "doesnt_count", "high school"
    if not row.is_rated:
        if row.is_online:
            return "doesnt_count", "online"
        if not row.is_mlh:
            return "doesnt_count", "not an MLH event"
        return "doesnt_count", "excluded"
    if not row.winners_announced:
        return "doesnt_count", "winners not announced"
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


def _set(conn: Connection, request_id: int, status: str, *, events: list[dict[str, Any]] | None = None,
         person_slug: str | None = None, failed: bool = False) -> str:
    conn.execute(
        "update public.add_requests set status = %s, events = coalesce(%s, events),"
        " person_slug = coalesce(%s, person_slug), attempts = attempts + %s, updated_at = now() where id = %s",
        (status, Jsonb(events) if events is not None else None, person_slug, int(failed), request_id),
    )
    conn.commit()
    return status


def lookup(conn: Connection, getter: Getter, request_id: int, username: str) -> str:
    """Work out one request's events; returns its new status."""
    _set(conn, request_id, "looking_up")
    try:
        projects = portfolio_projects(getter, username)
        if projects is None:
            return _set(conn, request_id, "not_found")
        events = submitted_events(getter, projects)
    except (FetchFailedError, ParseError):
        conn.rollback()
        return _set(conn, request_id, "failed", failed=True)

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
        states.append(EventState(slug, row.title if row else title, row.ends_on if row else None, state, reason))
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
            "select id, username from public.add_requests where lower(username) = lower(%s) and status = 'queued'"
            " order by created_at desc limit 1",
            (username,),
        ).fetchall()
    else:
        rows = conn.execute(
            "select id, username from public.add_requests where status = 'queued' order by created_at limit %s",
            (MAX_PENDING,),
        ).fetchall()
    return [(int(r[0]), str(r[1])) for r in rows]
```

- [ ] **Step 5: Run the unit tests**

Run: `uv run pytest -q tests/test_add.py`
Expected: all pass, at least 12 tests.

- [ ] **Step 6: Write the DB test** (`pipeline/tests/test_add_db.py`)

```python
"""Add-me lookup against a migrated database (pytest -m db)."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import psycopg
import pytest
from conftest import read_fixture

from hackladder.add import lookup, pending_lookups
from hackladder.crawl.http import FetchResult

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
        c.execute("delete from public.hackathons where slug like 't-add-%'")
        c.commit()


def project_page(*hosts: str) -> str:
    """The smallest project page parse_project accepts, submitted to these hackathons."""
    subs = "".join(
        f'<div class="software-list-content"><p><a href="https://{h}.devpost.com/">{h} title</a></p></div>'
        for h in hosts
    )
    return (
        '<html><body><div id="app-title">Scratch ML</div>'
        f'<div id="submissions"><ul class="software-list-with-thumbnail"><li>{subs}</li></ul></div>'
        "</body></html>"
    )


class Pages:
    def __init__(self, pages: dict[str, str]) -> None:
        self.pages = pages

    def get(self, url: str, max_age: timedelta | None = None) -> FetchResult:
        text = self.pages.get(url)
        return FetchResult(url, 200 if text is not None else 404, text or "", 0.0)


def hackathon(conn: psycopg.Connection[Any], slug: str, **kw: object) -> int:
    cols = {"source_id": slug, "slug": slug, "title": slug.title(), "url": f"https://{slug}.devpost.com/",
            "ends_on": "2026-03-01", "is_mlh": True, "winners_announced": True} | kw
    row = conn.execute(
        f"insert into public.hackathons ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) returning id",
        list(cols.values()),
    ).fetchone()
    assert row is not None
    return int(row[0])


def test_lookup_sorts_each_event(conn: psycopg.Connection[Any]) -> None:
    hackathon(conn, "t-add-counts")
    hackathon(conn, "t-add-online", is_online=True)
    hackathon(conn, "t-add-notmlh", is_mlh=False)
    conn.commit()
    rid = conn.execute("insert into public.add_requests (username) values ('t-add-dylan') returning id").fetchone()[0]
    conn.commit()
    pages = Pages({
        "https://devpost.com/t-add-dylan": PORTFOLIO,
        "https://devpost.com/software/scratchml": project_page("t-add-counts", "t-add-online", "t-add-notmlh", "t-add-unknown"),
    })
    assert lookup(conn, pages, rid, "t-add-dylan") == "crawling"
    events = conn.execute("select events from public.add_requests where id = %s", (rid,)).fetchone()[0]
    by_slug = {e["slug"]: (e["state"], e["reason"]) for e in events}
    assert by_slug == {
        "t-add-counts": ("queued", None),
        "t-add-online": ("doesnt_count", "online"),
        "t-add-notmlh": ("doesnt_count", "not an MLH event"),
        "t-add-unknown": ("doesnt_count", "not on HackLadder"),
    }


def test_lookup_of_a_missing_user(conn: psycopg.Connection[Any]) -> None:
    rid = conn.execute("insert into public.add_requests (username) values ('t-add-ghost') returning id").fetchone()[0]
    conn.commit()
    assert lookup(conn, Pages({}), rid, "t-add-ghost") == "not_found"
    assert all(u != "t-add-ghost" for _, u in pending_lookups(conn, None))  # no longer waiting


def test_pending_lookups_takes_the_latest_for_a_username(conn: psycopg.Connection[Any]) -> None:
    conn.execute("insert into public.add_requests (username) values ('t-add-zed'), ('t-add-zed')")
    conn.commit()
    latest = conn.execute("select max(id) from public.add_requests where username = 't-add-zed'").fetchone()[0]
    assert pending_lookups(conn, "T-ADD-ZED") == [(latest, "t-add-zed")]
```

`project_page` builds minimal HTML that the real `parse_project` must accept. Before relying on it, open `pipeline/src/hackladder/parse/project.py` and check the selectors it uses for the title and the "Submitted to" blocks. Then edit `project_page` so its markup matches them exactly. If `parse_project` requires more (for example a members section), copy the smallest real fixture from `pipeline/tests/fixtures/project/` and string-replace its submission links instead.

- [ ] **Step 7: Run the DB tests** (apply the Task 1 migration first; see the commands above)

Expected: `test_add_db.py` passes, and the existing DB tests still pass.

- [ ] **Step 8: Lint, format, commit**

```bash
uv run ruff check src tests && uv run ruff format src tests
git add pipeline/src/hackladder/add.py pipeline/tests/test_add.py pipeline/tests/test_add_db.py pipeline/tests/fixtures/user/jemsbhai.html pipeline/tests/fixtures/manifest.json
git commit -m "feat(pipeline): add-me lookup from a Devpost portfolio"
```

---

### Task 3: Crawl queued events first, and finish requests

**Files:**
- Modify: `pipeline/src/hackladder/add.py` (add `queued_slugs`, `mark_loaded`, `finish`)
- Modify: `pipeline/src/hackladder/crawl/events.py:41-66` (add `prioritize`, use it in `crawl_events`)
- Test: `pipeline/tests/test_add.py`, `pipeline/tests/test_add_db.py`

**Interfaces:**
- Consumes: `add_requests` (Task 1) and its `events` shape (Task 2).
- Produces:
  - `queued_slugs(conn) -> list[str]`;
  - `mark_loaded(conn) -> None`;
  - `finish(conn) -> tuple[int, int]` (requests made live, requests set to nothing_counts);
  - `prioritize(rows, requested: Callable[[], list[str]], every: int = 10) -> Iterator[row]` in `hackladder.crawl.events`.

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_add.py`:
```python
from hackladder.crawl.events import prioritize


def test_prioritize_puts_requested_events_first_and_rechecks() -> None:
    rows = [(i, f"e{i}", None) for i in range(25)]
    asks = iter([["e20"], ["e24"], []])
    out = [r[1] for r in prioritize(rows, lambda: next(asks, []), every=10)]
    assert out[0] == "e20"  # asked before the run
    assert out.index("e24") == 11  # asked during it: picked up at the next check (after 10 more)
    assert sorted(out) == sorted(r[1] for r in rows) and len(out) == 25  # each once
```

Append to `pipeline/tests/test_add_db.py`:
```python
from hackladder.add import finish, queued_slugs


def test_finish_marks_loaded_events_and_goes_live(conn: psycopg.Connection[Any]) -> None:
    hid = hackathon(conn, "t-add-done")
    conn.execute(
        "insert into public.add_requests (username, status, events) values ('t-add-amy', 'crawling', %s)",
        ('[{"slug": "t-add-done", "title": "Done", "ends_on": null, "state": "queued", "reason": null}]',),
    )
    conn.commit()
    assert "t-add-done" in queued_slugs(conn)
    # The crawl loads a project and the rating run rates its member.
    pid = conn.execute("insert into public.people (slug, display_name) values ('t-add-amy', 'Amy') returning id").fetchone()[0]
    acc = conn.execute(
        "insert into public.accounts (source, source_id, display_name, person_id) values ('devpost', 't-add-amy', 'Amy', %s) returning id",
        (pid,),
    ).fetchone()[0]
    prj = conn.execute(
        "insert into public.projects (source, source_id, hackathon_id, title) values ('devpost', 't-add-p', %s, 'P') returning id",
        (hid,),
    ).fetchone()[0]
    conn.execute("insert into public.project_members (project_id, account_id) values (%s, %s)", (prj, acc))
    conn.execute(
        "insert into public.ratings (person_id, mu, sigma, score, events, placements, grand_prizes, last_event_on, percentile, provisional)"
        " values (%s, 25, 8, 1000, 1, 0, 0, current_date, null, true)",
        (pid,),
    )
    conn.commit()
    assert finish(conn) == (1, 0)
    status, slug, events = conn.execute(
        "select status, person_slug, events from public.add_requests where username = 't-add-amy'"
    ).fetchone()
    assert (status, slug, events[0]["state"]) == ("live", "t-add-amy", "loaded")
    assert "t-add-done" not in queued_slugs(conn)
```
Extend the `conn` fixture cleanup, before the hackathons delete, with:
`c.execute("delete from public.ratings where person_id in (select id from public.people where slug like 't-add-%')")`,
`c.execute("delete from public.accounts where source_id like 't-add-%'")` and
`c.execute("delete from public.people where slug like 't-add-%'")`.
Projects and project members cascade from `hackathons` (`on delete cascade` in `20261014000200_core_entities.sql`), so the existing hackathons delete removes them.

- [ ] **Step 2: Run them to make sure they fail**

Run: `uv run pytest -q tests/test_add.py -k prioritize`
Expected: `ImportError: cannot import name 'prioritize'`.

- [ ] **Step 3: Implement**

In `pipeline/src/hackladder/add.py`, append:
```python
def queued_slugs(conn: Connection) -> list[str]:
    """Events waiting on an open request: `hl add crawl` and the daily backfill crawl these first."""
    rows = conn.execute(
        "select distinct e ->> 'slug' from public.add_requests r cross join lateral jsonb_array_elements(r.events) e"
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
```

In `pipeline/src/hackladder/crawl/events.py`:
- Add `from collections.abc import Callable, Iterator, Sequence` to the imports.
- Add `from hackladder.add import queued_slugs`.
- Add `REQUEST_CHECK_EVERY = 10` next to `SETTLE_DAYS`.
- Add this function after `_events`:

```python
def prioritize(
    rows: Sequence[tuple[int, str, date | None]], requested: Callable[[], list[str]], every: int = REQUEST_CHECK_EVERY
) -> Iterator[tuple[int, str, date | None]]:
    """The backfill's order: events someone asked for (add-me requests) first, re-checked every
    ``every`` events so a request made mid-run is crawled within minutes, then newest first."""
    by_slug = {r[1]: r for r in rows}
    seen: set[str] = set()
    for i, row in enumerate(rows):
        if i % every == 0:
            for slug in requested():
                if slug in by_slug and slug not in seen:
                    seen.add(slug)
                    yield by_slug[slug]
        if row[1] not in seen:
            seen.add(row[1])
            yield row
```

In `crawl_events`, replace `for hackathon_id, slug, ends_on in _events(conn, slugs):` with:
```python
    rows = _events(conn, slugs)
    ordered = rows if slugs else prioritize(rows, lambda: queued_slugs(conn))
    for hackathon_id, slug, ends_on in ordered:
```

If importing `hackladder.add` from `crawl/events.py` creates an import cycle (`add.py` imports `hackladder.crawl.http`, which must not import `crawl.events`), move the import inside `crawl_events`. Check with `uv run python -c "import hackladder.crawl.events"`.

- [ ] **Step 4: Run all pipeline tests (unit and DB)**

Expected: all pass. The existing `crawl_events` tests are unaffected because they have no `crawling` requests.

- [ ] **Step 5: Commit**

```bash
uv run ruff check src tests && uv run ruff format src tests
git add pipeline/src/hackladder/add.py pipeline/src/hackladder/crawl/events.py pipeline/tests/test_add.py pipeline/tests/test_add_db.py
git commit -m "feat(pipeline): crawl requested events first; finish add-me requests"
```

---

### Task 4: `hl add` commands and workflows

**Files:**
- Modify: `pipeline/src/hackladder/cli.py` (new `add_app` with `lookup`, `crawl`, `finish`)
- Create: `.github/workflows/add-hacker.yml`
- Modify: `.github/workflows/crawl-events.yml`

**Interfaces:**
- Consumes: `lookup`, `pending_lookups`, `queued_slugs`, `mark_loaded`, `finish`, `USERNAME` (Tasks 2–3); `crawl_events`, `CachedFetcher`, `PoliteClient`, `_github_output`, `_connect`, `db.pipeline_run` (existing).
- Produces:
  - CLI `hl add lookup [--username U]`, which writes GitHub output `queued=true|false`;
  - CLI `hl add crawl`;
  - CLI `hl add finish`;
  - workflow `add-hacker.yml` with input `username`.

- [ ] **Step 1: Add the commands** (in `cli.py`, after the `crawl events` command)

```python
add_app = typer.Typer(no_args_is_help=True, help="Add-me requests: look up, crawl and finish (spec 2026-10-29).")
app.add_typer(add_app, name="add")


@add_app.command("lookup")
def add_lookup_command(
    username: Annotated[str | None, typer.Option(help="One request; default: every queued one.")] = None,
    cache_dir: CacheDir = DEFAULT_CACHE,
) -> None:
    """Read requesters' Devpost portfolios and sort their hackathons (rated, queued, doesn't count)."""
    if username is not None and not add.USERNAME.fullmatch(username):
        raise typer.BadParameter("not a Devpost username", param_hint="--username")
    queued = False
    with _connect() as conn, PoliteClient() as client:
        client.load_robots()
        fetcher = CachedFetcher(client, cache_dir)
        for request_id, name in add.pending_lookups(conn, username):
            status = add.lookup(conn, fetcher, request_id, name)
            queued |= status == "crawling"
            typer.echo(f"{name}: {status}")
    _github_output(queued=queued)


@add_app.command("crawl")
def add_crawl_command(cache_dir: CacheDir = DEFAULT_CACHE) -> None:
    """Crawl every event an open request is waiting on (all of them: a cancelled pending run's
    requests are served by whichever run gets the lock)."""
    with _connect() as conn, PoliteClient() as client:
        slugs = add.queued_slugs(conn)
        if not slugs:
            typer.echo("No events waiting.")
            return
        client.load_robots()
        tiers = load_rating_config(conn).prize_tiers
        with db.pipeline_run(conn, "add crawl") as stats:
            fetcher = CachedFetcher(client, cache_dir)
            result = crawl_events(fetcher, conn, tiers, slugs=slugs)
            stats.pages_fetched = client.requests_made
            stats.failures = len(result.failures)
            stats.summary = asdict(result)
        add.mark_loaded(conn)
    typer.echo(f"{result.events} of {len(slugs)} events crawled, {result.projects} projects; {len(result.failures)} failed.")


@add_app.command("finish")
def add_finish_command() -> None:
    """After rating: mark requests live (or nothing_counts) once nothing they wait on is queued."""
    with _connect() as conn:
        live, nothing = add.finish(conn)
    typer.echo(f"{live} live, {nothing} found on none of their events.")
```
Add `from hackladder import add, db` (replacing `from hackladder import db`).

- [ ] **Step 2: Smoke-test the CLI help**

Run: `uv run hl add --help && uv run hl add lookup --username "bad name"`
Expected: the help lists `lookup crawl finish`. The second command exits non-zero with "not a Devpost username".

- [ ] **Step 3: Write `.github/workflows/add-hacker.yml`**

```yaml
name: Add a hacker

# Started by the site when someone asks to be added (spec 2026-10-29-find-yourself): read their
# Devpost portfolio, then crawl the hackathons that count, rate, refresh the site and mark the
# request live. Lookup takes no lock; the crawl waits its turn behind any other pipeline run.
on:
  workflow_dispatch:
    inputs:
      username:
        description: "Devpost username"
        required: true
        type: string

permissions:
  contents: read

jobs:
  lookup:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: pipeline
    outputs:
      queued: ${{ steps.lookup.outputs.queued }}
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
        with:
          enable-cache: true
          cache-dependency-glob: pipeline/uv.lock
      - run: uv sync --locked --no-dev
      - name: Look up
        id: lookup
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          USERNAME: ${{ inputs.username }}
        # Checked before use: the input comes from a dispatch, not from this repo.
        run: |
          [[ "$USERNAME" =~ ^[A-Za-z0-9_-]{1,40}$ ]] || { echo "not a Devpost username: $USERNAME"; exit 1; }
          uv run hl add lookup --username "$USERNAME"

  crawl:
    needs: lookup
    if: needs.lookup.outputs.queued == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 120
    concurrency:
      group: pipeline-db  # never overlaps another crawl or a rating run
      cancel-in-progress: false
    defaults:
      run:
        working-directory: pipeline
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
        with:
          enable-cache: true
          cache-dependency-glob: pipeline/uv.lock
      - run: uv sync --locked --no-dev
      - uses: actions/cache@v4
        with:
          path: pipeline/.cache/raw
          key: raw-pages-${{ github.run_id }}
          restore-keys: raw-pages-
      - name: Crawl waiting events
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: uv run hl add crawl
      - name: Rate and publish
        id: rate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: uv run hl rate --if-changed
      - name: Revalidate the site
        if: steps.rate.outputs.published == 'true'
        env:
          REVALIDATE_SECRET: ${{ secrets.REVALIDATE_SECRET }}
        run: |
          if [ -n "$REVALIDATE_SECRET" ]; then
            curl -fsS -X POST https://www.hackladder.com/api/revalidate -H "Authorization: Bearer $REVALIDATE_SECRET"
          fi
      - name: Finish requests
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: uv run hl add finish
```

- [ ] **Step 4: Edit `.github/workflows/crawl-events.yml`**

Insert before the `- name: Crawl` step:
```yaml
      # Requests whose dispatch never ran get looked up here; their events are then crawled
      # first by the backfill (spec 2026-10-29-find-yourself).
      - name: Look up waiting add-me requests
        continue-on-error: true
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: uv run hl add lookup
```
Then append after the `Revalidate the site` step:
```yaml
      - name: Finish add-me requests
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: uv run hl add finish
```

- [ ] **Step 5: Validate the workflow YAML**

Run (from the repo root): `uv run --project pipeline python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print('ok')" .github/workflows/add-hacker.yml .github/workflows/crawl-events.yml`
Expected: `ok`. If PyYAML isn't installed in the pipeline env, use `uvx --from pyyaml python -c ...`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/hackladder/cli.py .github/workflows/add-hacker.yml .github/workflows/crawl-events.yml
git commit -m "feat(pipeline): hl add lookup/crawl/finish and the add-hacker workflow"
```

---

### Task 5: `lib/add.ts`: the rules and copy the pages share

**Files:**
- Create: `apps/web/lib/add.ts`
- Create: `apps/web/tests/add.test.ts`

**Interfaces:**
- Produces:
  - `DEVPOST_USERNAME: RegExp`;
  - `asUsername(raw: string | null | undefined): string | null`;
  - `addHref(q?: string | null): string`;
  - the types `AddStatus`, `AddEventState`, `AddEvent`, `AddRequest`;
  - `isFinished(s: AddStatus): boolean`;
  - `POLL_MS = 4000` and `POLL_FOR_MS = 600000`;
  - `statusCopy(r: AddRequest): { title: string; body: string }`;
  - `EVENT_STATE_LABEL: Record<AddEventState, string>`.

- [ ] **Step 1: Write the failing test** (`apps/web/tests/add.test.ts`)

```ts
import { describe, expect, it } from "vitest";

import { addHref, asUsername, isFinished, statusCopy, type AddRequest } from "@/lib/add";

const req = (status: AddRequest["status"], extra: Partial<AddRequest> = {}): AddRequest => ({
  username: "kori",
  status,
  events: [],
  person_slug: null,
  updated_at: "2026-10-29T12:00:00Z",
  ...extra,
});

describe("add-me (spec 2026-10-29)", () => {
  it("reads a Devpost username from what people paste", () => {
    expect(asUsername("jemsbhai")).toBe("jemsbhai");
    expect(asUsername("  @jemsbhai ")).toBe("jemsbhai");
    expect(asUsername("https://devpost.com/jemsbhai")).toBe("jemsbhai");
    expect(asUsername("devpost.com/jemsbhai?ref=x")).toBe("jemsbhai");
    expect(asUsername("kori russell")).toBeNull();
    expect(asUsername("")).toBeNull();
    expect(asUsername("x".repeat(41))).toBeNull();
  });

  it("links no-results to /add, pre-filled when the query is a username", () => {
    expect(addHref("jemsbhai")).toBe("/add?u=jemsbhai");
    expect(addHref("kori russell")).toBe("/add");
    expect(addHref(null)).toBe("/add");
  });

  it("keeps checking only while the pipeline is working", () => {
    expect(isFinished("queued")).toBe(false);
    expect(isFinished("looking_up")).toBe(false);
    expect(isFinished("crawling")).toBe(false);
    for (const s of ["already_here", "live", "nothing_counts", "not_found", "failed"] as const) expect(isFinished(s)).toBe(true);
  });

  it("has copy for every status, naming the username where it helps", () => {
    for (const s of ["queued", "looking_up", "already_here", "crawling", "live", "nothing_counts", "not_found", "failed"] as const) {
      const c = statusCopy(req(s));
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
    }
    expect(statusCopy(req("not_found")).title).toContain("kori");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run (from `apps/web/`): `pnpm -s test tests/add.test.ts`
Expected: FAIL, cannot resolve `@/lib/add`.

- [ ] **Step 3: Write `apps/web/lib/add.ts`**

```ts
// Add-me requests (spec docs/superpowers/specs/2026-10-29-find-yourself-design.md): the username
// rule, links and copy shared by /add, its status page and the no-results states. Pure, so tested.

/** A Devpost username, as the database, the workflow and the pipeline check it. */
export const DEVPOST_USERNAME = /^[A-Za-z0-9_-]{1,40}$/;

export const POLL_MS = 4000;
export const POLL_FOR_MS = 10 * 60 * 1000;

export type AddStatus =
  | "queued" | "looking_up" | "already_here" | "crawling" | "live" | "nothing_counts" | "not_found" | "failed"; // prettier-ignore
export type AddEventState = "rated" | "queued" | "backlog" | "loaded" | "doesnt_count";
export type AddEvent = { slug: string; title: string; ends_on: string | null; state: AddEventState; reason: string | null };
export type AddRequest = { username: string; status: AddStatus; events: AddEvent[]; person_slug: string | null; updated_at: string };

/** A username from what people type or paste: "@name", "devpost.com/name", a full URL. */
export function asUsername(raw: string | null | undefined): string | null {
  const u = (raw ?? "")
    .trim()
    .replace(/^@/, "")
    .replace(/^(https?:\/\/)?(www\.)?devpost\.com\//i, "")
    .replace(/[/?#].*$/, "");
  return DEVPOST_USERNAME.test(u) ? u : null;
}

/** Where "Not here? Add yourself" goes, pre-filled when the search looked like a username. */
export function addHref(q?: string | null): string {
  const u = asUsername(q);
  return u ? `/add?u=${encodeURIComponent(u)}` : "/add";
}

export function isFinished(s: AddStatus): boolean {
  return s !== "queued" && s !== "looking_up" && s !== "crawling";
}

export const EVENT_STATE_LABEL: Record<AddEventState, string> = {
  rated: "rated",
  queued: "queued",
  backlog: "queued for the daily crawl",
  loaded: "loaded",
  doesnt_count: "doesn't count",
};

export function statusCopy(r: AddRequest): { title: string; body: string } {
  switch (r.status) {
    case "queued":
    case "looking_up":
      return { title: "Reading your Devpost profile…", body: "This takes a minute or two. Keep this page open." };
    case "already_here":
      return { title: "You're already on HackLadder", body: "Every hackathon of yours that counts is already rated." };
    case "crawling":
      return {
        title: "Loading your events",
        body: "Your rating publishes when this run finishes. While the daily crawl is running (09:00–14:00 UTC), that's by about 14:00 UTC.",
      };
    case "live":
      return { title: "You're live", body: "Your profile now includes these events." };
    case "nothing_counts":
      return {
        title: "None of these count yet",
        body: "Ratings come from in-person MLH member events with announced winners. Online jams and corporate challenges don't count.",
      };
    case "not_found":
      return { title: `No Devpost user called ${r.username}`, body: `Check devpost.com/${r.username} and try again.` };
    case "failed":
      return { title: "We couldn't reach Devpost", body: "Try again in a few minutes." };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm -s test tests/add.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/add.ts apps/web/tests/add.test.ts
git commit -m "feat(web): add-me rules and copy"
```

---

### Task 6: `/add`, the status page and the polling route

**Files:**
- Create: `apps/web/lib/github.ts`
- Modify: `apps/web/app/admin/actions.ts:271-291` (use `lib/github.ts`)
- Create: `apps/web/lib/add-data.ts`
- Create: `apps/web/app/(site)/add/actions.ts`, `apps/web/app/(site)/add/add-form.tsx`, `apps/web/app/(site)/add/page.tsx`
- Create: `apps/web/app/(site)/add/[username]/page.tsx`, `apps/web/app/(site)/add/[username]/status-view.tsx`
- Create: `apps/web/app/api/add/[username]/route.ts`
- Modify: `apps/web/app/robots.ts`
- Modify: `apps/web/lib/supabase/database.types.ts` (regenerate)

**Interfaces:**
- Consumes: Task 1's RPCs and Task 5's `lib/add.ts`.
- Produces:
  - `dispatchWorkflow(workflow: string, inputs?: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }>`;
  - `getAddRequest(username: string): Promise<AddRequest | null>`;
  - `requestAdd(prev: AddFormState, form: FormData): Promise<AddFormState>`;
  - routes `/add`, `/add/[username]` and `GET /api/add/[username]`.

- [ ] **Step 1: Regenerate the DB types** (from the repo root, with the Task 1 migration applied to `hl-pg`)

```bash
docker run -d --rm --name hl-meta --network container:hl-pg -e PG_META_DB_URL=postgresql://postgres:postgres@localhost:5432/postgres public.ecr.aws/supabase/postgres-meta:v0.95.1
docker exec hl-meta node -e "fetch('http://localhost:8080/generators/typescript?included_schemas=public').then(r=>r.text()).then(t=>process.stdout.write(t))" > apps/web/lib/supabase/database.types.ts
docker stop hl-meta
git diff --stat apps/web/lib/supabase/database.types.ts
```
Expected: the diff adds `add_requests`, `request_add` and `add_request_status`. If it also removes things that exist in production, the local DB is missing a migration. Apply every file in `supabase/migrations/` that's newer than the DB and regenerate.

- [ ] **Step 2: Move `dispatchWorkflow` into `apps/web/lib/github.ts`**

```ts
import "server-only";

/** Starts a GitHub Actions workflow on main. Needs GITHUB_DISPATCH_TOKEN (server-only). */
export async function dispatchWorkflow(
  workflow: string,
  inputs?: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY ?? "Korirussell/HackLadder";
  if (!token) return { ok: false, error: "GitHub Actions isn't connected: set GITHUB_DISPATCH_TOKEN (a fine-grained token with Actions: write)." };
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", ...(inputs && { inputs }) }),
  });
  if (res.status !== 204) return { ok: false, error: `GitHub didn't start the run (HTTP ${res.status}): ${await res.text()}` };
  return { ok: true };
}
```
In `apps/web/app/admin/actions.ts`:
- Delete the old `dispatchWorkflow` function (lines 273–291).
- Add `import { dispatchWorkflow as startWorkflow } from "@/lib/github";`.
- Add this adapter where the old function was:

```ts
/** Starts a GitHub Actions workflow on main, as a form result. */
async function dispatchWorkflow(workflow: string, inputs?: Record<string, string>): Promise<FormState> {
  const started = await startWorkflow(workflow, inputs);
  return started.ok ? OK : fail(started.error);
}
```
The existing callers stay unchanged. Run `pnpm -s typecheck` and expect no errors.

- [ ] **Step 3: Data read and server action**

`apps/web/lib/add-data.ts`:
```ts
import "server-only";

import type { AddRequest } from "./add";
import { publicClient } from "./supabase/public";

/** The latest add-me request for a username, uncached: the status page polls it. */
export async function getAddRequest(username: string): Promise<AddRequest | null> {
  const supabase = publicClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("add_request_status", { p_username: username });
  if (error) throw new Error(`add_request_status: ${error.message}`);
  return (data ?? null) as AddRequest | null;
}
```

`apps/web/app/(site)/add/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";

import { asUsername } from "@/lib/add";
import { dispatchWorkflow } from "@/lib/github";
import { publicClient } from "@/lib/supabase/public";

export type AddFormState = { error: string | null };

/** Records an add-me request and starts the lookup (spec 2026-10-29-find-yourself). */
export async function requestAdd(_prev: AddFormState, form: FormData): Promise<AddFormState> {
  const username = asUsername(String(form.get("username") ?? ""));
  if (!username) return { error: "That isn't a Devpost username. Use the part after devpost.com/ (letters, numbers, - and _)." };
  const supabase = publicClient();
  if (!supabase) return { error: "HackLadder can't take requests right now. Try again later." };
  const { data, error } = await supabase.rpc("request_add", { p_username: username });
  if (error) {
    return { error: error.message.includes("add_requests_busy") ? "Lots of requests today. Try again tomorrow." : "Something went wrong. Try again in a minute." };
  }
  if (data?.[0]?.is_new) {
    // If GitHub doesn't start it, the daily crawl looks up waiting requests before it runs.
    const started = await dispatchWorkflow("add-hacker.yml", { username });
    if (!started.ok) console.error(`add-hacker dispatch for ${username}: ${started.error}`);
  }
  redirect(`/add/${encodeURIComponent(username)}`);
}
```

- [ ] **Step 4: The `/add` page**

`apps/web/app/(site)/add/add-form.tsx`:
```tsx
"use client";

import { useActionState } from "react";

import { buttonClass, fieldClass } from "@/components/site/bits";

import { type AddFormState, requestAdd } from "./actions";

const IDLE: AddFormState = { error: null };

export function AddForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState(requestAdd, IDLE);
  return (
    <form action={action} className="grid gap-3 p-[22px]">
      <label className="grid gap-1.5">
        <span className="font-semibold">Your Devpost username</span>
        <span className="sys text-[12px] text-muted">devpost.com/<b>username</b></span>
        <input name="username" defaultValue={initial} required maxLength={80} autoComplete="off" spellCheck={false} className={fieldClass} />
      </label>
      {state.error && <p role="alert" className="text-[15px]">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Looking you up" : "Find my hackathons"}
        </button>
      </div>
    </form>
  );
}
```

`apps/web/app/(site)/add/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import { SectionHead, Win } from "@/components/os/window";
import { asUsername } from "@/lib/add";

import { AddForm } from "./add-form";

export const metadata: Metadata = { title: "Add yourself", robots: { index: false } };

// Where "Not here? Add yourself" lands (spec 2026-10-29-find-yourself).
export default function AddPage(props: PageProps<"/add">) {
  return (
    <>
      <SectionHead as="h1" title="Add yourself">
        Enter your Devpost username. We&apos;ll find the hackathons you entered, load the ones that count, and rate you,
        usually the same day.
      </SectionHead>
      <div className="max-w-[640px]">
        <Win title="add.app">
          <Suspense fallback={<AddForm initial="" />}>
            <Prefilled searchParams={props.searchParams} />
          </Suspense>
        </Win>
      </div>
    </>
  );
}

async function Prefilled({ searchParams }: Pick<PageProps<"/add">, "searchParams">) {
  const u = (await searchParams).u;
  return <AddForm initial={asUsername(typeof u === "string" ? u : null) ?? ""} />;
}
```

- [ ] **Step 5: The polling route and the status page**

`apps/web/app/api/add/[username]/route.ts`:
```ts
import { connection, NextResponse } from "next/server";

import { asUsername } from "@/lib/add";
import { getAddRequest } from "@/lib/add-data";

// The status page's poll: always fresh, never cached (spec 2026-10-29-find-yourself).
export async function GET(_req: Request, ctx: RouteContext<"/api/add/[username]">) {
  await connection();
  const username = asUsername(decodeURIComponent((await ctx.params).username));
  if (!username) return NextResponse.json({ error: "not a Devpost username" }, { status: 400 });
  return NextResponse.json(await getAddRequest(username), { headers: { "Cache-Control": "no-store" } });
}
```

`apps/web/app/(site)/add/[username]/status-view.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/site/bits";
import { Win } from "@/components/os/window";
import { type AddRequest, EVENT_STATE_LABEL, isFinished, POLL_FOR_MS, POLL_MS, statusCopy } from "@/lib/add";

/** An add-me request, re-checked every few seconds until the pipeline is done with it. */
export function AddStatusView({ initial }: { initial: AddRequest }) {
  const [r, setR] = useState(initial);
  useEffect(() => {
    if (isFinished(r.status)) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_FOR_MS) return clearInterval(timer);
      try {
        const res = await fetch(`/api/add/${encodeURIComponent(r.username)}`, { cache: "no-store" });
        const next = (await res.json()) as AddRequest | null;
        if (res.ok && next) setR(next);
      } catch {
        // A missed poll just waits for the next one.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [r.status, r.username]);

  const copy = statusCopy(r);
  const done = isFinished(r.status);
  return (
    <div className="grid max-w-[720px] gap-6">
      <Win title={`add/${r.username}`} meta={done ? "done" : "working…"}>
        <div className="grid gap-3 p-[22px]" aria-live="polite">
          <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{copy.title}</h2>
          <p>{copy.body}</p>
          <div className="flex flex-wrap gap-3">
            {r.person_slug && (r.status === "live" || r.status === "already_here") && (
              <>
                <Button href={`/h/${r.person_slug}`}>Open your profile</Button>
                <Button href="/claim" alt>Claim it</Button>
              </>
            )}
            {r.status === "failed" && <Button href={`/add?u=${encodeURIComponent(r.username)}`}>Try again</Button>}
            {r.status === "nothing_counts" && <Button href="/how-ratings-work" alt>What counts</Button>}
          </div>
        </div>
      </Win>
      {r.events.length > 0 && (
        <Win title="your_hackathons" meta={`${r.events.length}`}>
          <ul>
            {r.events.map((e) => (
              <li key={e.slug} className="flex items-baseline justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
                <span className="min-w-0">
                  {e.state === "rated" || e.state === "loaded" ? (
                    <Link href={`/e/${e.slug}`} className="font-semibold hover:underline">{e.title}</Link>
                  ) : (
                    <span className="font-semibold">{e.title}</span>
                  )}
                  {e.ends_on && <small className="sys ml-2 text-muted">{e.ends_on.slice(0, 7)}</small>}
                </span>
                <span className="sys shrink-0 text-[12px] text-muted">
                  {EVENT_STATE_LABEL[e.state]}
                  {e.reason ? `: ${e.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Win>
      )}
    </div>
  );
}
```
`apps/web/app/(site)/add/[username]/page.tsx`:
```tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingWin } from "@/components/site/loading";
import { SectionHead } from "@/components/os/window";
import { asUsername } from "@/lib/add";
import { getAddRequest } from "@/lib/add-data";

import { AddStatusView } from "./status-view";

export const metadata: Metadata = { title: "Add yourself", robots: { index: false } };

export default function AddStatusPage(props: PageProps<"/add/[username]">) {
  return (
    <>
      <SectionHead as="h1" title="Add yourself" />
      <Suspense fallback={<LoadingWin title="status" height={200} />}>
        <Status params={props.params} />
      </Suspense>
    </>
  );
}

async function Status({ params }: Pick<PageProps<"/add/[username]">, "params">) {
  const username = asUsername(decodeURIComponent((await params).username));
  if (!username) notFound();
  const r = await getAddRequest(username);
  if (!r) redirect(`/add?u=${encodeURIComponent(username)}`);
  return <AddStatusView initial={r} />;
}
```

In `apps/web/app/robots.ts`, add `"/add"` to the `disallow` list of the `"*"` rule.

- [ ] **Step 6: Typecheck, lint, test and build**

Run (from `apps/web/`): `pnpm -s typecheck && pnpm -s lint && pnpm -s test && pnpm -s build`
Expected: all pass, and the build lists `ƒ /add`, `ƒ /add/[username]` and `ƒ /api/add/[username]`. If the build complains that `/add/[username]` needs `generateStaticParams` under Cache Components, add the same placeholder pattern as `app/(site)/h/[slug]/page.tsx:17-21`: `export async function generateStaticParams() { return [{ username: "_" }]; }`. `asUsername("_")` is valid, so `getAddRequest` returns null and the page redirects.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/github.ts apps/web/lib/add-data.ts apps/web/app/admin/actions.ts "apps/web/app/(site)/add" apps/web/app/api/add apps/web/app/robots.ts apps/web/lib/supabase/database.types.ts
git commit -m "feat(web): /add and its status page"
```

---

### Task 7: Search is the hero, and no-results leads to /add

**Files:**
- Modify: `apps/web/app/(site)/page.tsx:22-80` (hero)
- Modify: `apps/web/components/site/search-box.tsx:14,86,132-136`
- Modify: `apps/web/components/site/search-window.tsx`
- Modify: `apps/web/app/(site)/search/page.tsx:52`

**Interfaces:**
- Consumes: `addHref` (Task 5).
- Produces: `SearchBox` and `SearchHoldingWindow` accept `autoFocus?: boolean | "desktop"` and `large?: boolean`.

- [ ] **Step 1: `search-box.tsx`**

Change the signature to:
```tsx
export function SearchBox({
  placeholder = "Your name or Devpost username",
  autoFocus = false,
  large = false,
}: {
  placeholder?: string;
  autoFocus?: boolean | "desktop"; // "desktop": not on phones, where it would pop the keyboard
  large?: boolean;
}) {
```
Add after the existing Cmd-K `useEffect`:
```tsx
  useEffect(() => {
    if (autoFocus === "desktop" && matchMedia("(min-width: 981px)").matches) input.current?.focus();
  }, [autoFocus]);
```
On the `<input>`, change `autoFocus={autoFocus}` to `autoFocus={autoFocus === true}`. Add `${large ? "py-4 text-[20px]" : "py-3"}` to the `<label>` className in place of its fixed `py-3`.
Replace the no-results paragraph with:
```tsx
            <p className="px-3.5 py-3">
              No results for &lsquo;{q.trim()}&rsquo;.{" "}
              <Link href={addHref(q)} className="font-semibold underline">
                Not here yet? Add yourself with your Devpost username
              </Link>
            </p>
```
Add the imports `import Link from "next/link";` and `import { addHref } from "@/lib/add";`.

- [ ] **Step 2: `search-window.tsx`**

Add `large?: boolean` and widen `autoFocus` to `boolean | "desktop"` in the props, then pass them through: `<SearchBox autoFocus={autoFocus} large={large} />`.

- [ ] **Step 3: `/search` no-results**

Replace `<Empty>No results for &lsquo;{q}&rsquo;. Try your Devpost username.</Empty>` with:
```tsx
        <Empty action={<Button href={addHref(q)}>Add yourself</Button>}>
          No results for &lsquo;{q}&rsquo;. If you&apos;ve entered a hackathon on Devpost, add yourself with your Devpost username.
        </Empty>
```
Import `Button` from `@/components/site/bits` and `addHref` from `@/lib/add`.

- [ ] **Step 4: The home hero** (`app/(site)/page.tsx`)

- Replace the `<h1>` content `Every hacker<br />who&apos;s won,<br />ranked.` with `Where do<br />you rank?`.
- Replace the hero grid `<div className="mt-10 grid grid-cols-[minmax(0,560px)_minmax(0,1fr)] …">…</div>`, which holds `SearchHoldingWindow` and the `top_3` `Win`, with:

```tsx
        <div className="mt-10 grid max-w-[720px] gap-3">
          <SearchHoldingWindow
            large
            autoFocus="desktop"
            meta={`${num(stats.hackers)} indexed`}
            status={[
              top[0] ? `Try: ${top[0].display_name.toLowerCase()}` : "Try your Devpost username",
              `Ratings from ${plural(stats.rated_events, "hackathon")}`,
            ]}
          />
          <p className="sys text-muted">
            {plural(stats.hackers, "hacker")} ·{" "}
            <Link href="/add" className="font-semibold text-ink underline">
              Not here? Add yourself →
            </Link>
          </p>
        </div>
```
This removes the `top_3` window from the hero. The ladder section below already shows the top 5. If `Change` and `top.slice` are now unused, remove their imports. Update the comment at the top of `Home()` to: `hero search ("Where do you rank?"), top of the ladder, school top 10, hardest 3 events, and the claim CTA`.

- [ ] **Step 5: Typecheck, lint, test and build**

Run: `pnpm -s typecheck && pnpm -s lint && pnpm -s test && pnpm -s build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(site)/page.tsx" apps/web/components/site/search-box.tsx apps/web/components/site/search-window.tsx "apps/web/app/(site)/search/page.tsx"
git commit -m "feat(web): search is the home hero; no results leads to /add"
```

---

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md` (§10 routes table, §12 jobs, §15 log)
- Modify: `docs/superpowers/specs/2026-10-29-find-yourself-design.md` (the three deviations)

- [ ] **Step 1: CLAUDE.md**

- **§10 (routes table, next to the `/claim` row):** add
  `| /add, /add/[username] | Add yourself by Devpost username, and the request's live status (spec 2026-10-29-find-yourself) |`.
- **§12 (jobs, next to the crawl events entry):** add a line on the `add-hacker.yml` workflow: lookup without the lock, then crawl, rate, revalidate and finish under `pipeline-db`. Note that `crawl-events.yml` now looks up waiting requests first and finishes them after rating.
- **§15:** add a `- 2026-10-30:` entry at the top of the log, summarizing the following:
  - the home hero is now "Where do you rank?";
  - `/add` and the `add_requests` flow;
  - the 30 / 20 / 24-hour / 200-a-day limits;
  - the backfill crawls requested events first;
  - `hl add crawl` and `hl add finish` serve every open request, because GitHub cancels all but one pending run per concurrency group.

- [ ] **Step 2: Fold the deviations into the spec**

In the spec:
- **§3 Job 1 step 5:** the `queued` bullet says "at most 20 per request; the rest are **backlog** (the daily crawl gets them)".
- **§3 Job 2:** `hl add crawl` crawls every open request's queued events, and `hl add finish` takes no arguments and finishes every request.
- **§3 Dispatch:** add "if dispatch fails, the daily crawl's `hl add lookup` (no username) picks the request up."
- **Event states in §2:** add **queued for the daily crawl**.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-29-find-yourself-design.md
git commit -m "docs: add-me flow in CLAUDE.md; spec matches the plan"
```

---

## After the plan: what the owner does

1. Review the migration `supabase/migrations/20261030000100_add_requests.sql`, then apply it to production with the scratchpad `apply_migration.py` (the same pattern as earlier migrations).
2. Merge the PR. Vercel deploys, and the workflow file lands on `main`, which `workflow_dispatch` needs.
3. Check that Vercel has `GITHUB_DISPATCH_TOKEN` (the admin "crawl confirmed" button already uses it) and that the token's repository access includes Actions: write.
4. Try it with your own Devpost username at `/add`.
