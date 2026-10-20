"""List crawl, loaders and MLH matching against a migrated database (pytest -m db)."""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import psycopg
import pytest
from conftest import read_fixture

from hackladder.crawl.http import FetchFailedError, FetchResult
from hackladder.crawl.listing import FULL_JOB, LIST_URL, SEARCH_URL, crawl_list, search_mlh_events
from hackladder.db import get_checkpoint
from hackladder.load.hackathons import upsert_hackathons
from hackladder.mlh import SEASON_URL, apply_matches, crawl_mlh_seasons
from hackladder.parse import parse_hackathon_list

pytestmark = [
    pytest.mark.db,
    pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="needs DATABASE_URL"),
]


@pytest.fixture
def conn() -> Iterator[psycopg.Connection[Any]]:
    """Changes are committed by the code under test, so clean up test rows afterwards."""
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c
        c.rollback()
        c.execute(
            "delete from public.mlh_events where slug like %s or season = any(%s)",
            ("test-%", ["2025", "2027", "2020 NA", "2020 Europe"]),
        )
        c.execute("delete from public.hackathons where source = 'devpost'")
        c.execute("delete from public.crawl_checkpoints")
        c.execute("delete from public.raw_pages_index")
        c.execute("delete from public.crawl_failures")
        c.commit()


class Pages:
    def __init__(self, pages: dict[str, str], failing: frozenset[str] = frozenset()) -> None:
        self.pages, self.failing, self.requested = pages, failing, list[str]()

    def get(self, url: str) -> FetchResult:
        self.requested.append(url)
        if url in self.failing:
            raise FetchFailedError(url, 503, "HTTP 503", 4)
        text = self.pages.get(url)
        return FetchResult(url, 200 if text is not None else 404, text or "", 0.0)


LIST_PAGE = read_fixture("list/ended_page1.json")
EMPTY_PAGE = json.dumps({"hackathons": [], "meta": {"total_count": 0, "per_page": 9}})


def list_page(offset_ids: int, ends: str = "Feb 16 - 18, 2024") -> str:
    """The real fixture with ids shifted, so successive pages hold different events."""
    data = json.loads(LIST_PAGE)
    for h in data["hackathons"]:
        h["id"] += offset_ids
        h["url"] = h["url"].replace(".devpost.com", f"-{offset_ids}.devpost.com")
        h["submission_period_dates"] = ends
    return json.dumps(data)


def test_upsert_is_idempotent_and_flags_high_school(conn: psycopg.Connection[Any]) -> None:
    metas = parse_hackathon_list(LIST_PAGE).hackathons
    first = upsert_hackathons(conn, metas)
    again = upsert_hackathons(conn, metas)
    assert (first.inserted, again.inserted, again.updated) == (9, 0, 9)

    teen = json.loads(LIST_PAGE)
    teen["hackathons"][0].update(id=999001, title="Teen Hacks LA", url="https://teenhacks.devpost.com/")
    upsert_hackathons(conn, parse_hackathon_list(json.dumps(teen)).hackathons[:1])
    flags = dict(
        conn.execute("select slug, is_high_school from public.hackathons where source = 'devpost'").fetchall()
    )
    assert flags["teenhacks"] is True
    assert flags["firstcommit"] is False


def test_slug_collisions_get_the_devpost_id(conn: psycopg.Connection[Any]) -> None:
    metas = parse_hackathon_list(LIST_PAGE).hackathons
    upsert_hackathons(conn, metas[:1])
    clash = json.loads(LIST_PAGE)
    clash["hackathons"][0]["id"] = 424242  # same subdomain, different Devpost event
    upsert_hackathons(conn, parse_hackathon_list(json.dumps(clash)).hackathons[:1])
    slugs = {
        r[0] for r in conn.execute("select slug from public.hackathons where source = 'devpost'").fetchall()
    }
    assert {"firstcommit", "firstcommit-424242"} <= slugs


def test_full_crawl_resumes_from_its_checkpoint(conn: psycopg.Connection[Any], tmp_path: Path) -> None:
    pages = {LIST_URL.format(page=1): list_page(1000), LIST_URL.format(page=2): list_page(2000)}
    stopped = crawl_list(Pages(pages, failing=frozenset({LIST_URL.format(page=2)})), conn, tmp_path)
    assert stopped.pages == 1
    assert "kept failing" in stopped.stopped
    assert get_checkpoint(conn, FULL_JOB) == {"page": 1, "total_count": 13889}

    pages[LIST_URL.format(page=3)] = EMPTY_PAGE
    fetcher = Pages(pages)
    done = crawl_list(fetcher, conn, tmp_path)
    assert fetcher.requested[0] == LIST_URL.format(page=2)  # resumed, page 1 not refetched
    assert (done.first_page, done.pages, done.stopped) == (2, 1, "end of the list")
    assert get_checkpoint(conn, FULL_JOB) is None
    assert conn.execute("select count(*) from public.hackathons where source = 'devpost'").fetchone() == (18,)
    assert conn.execute("select count(*) from public.raw_pages_index").fetchone() == (3,)
    assert conn.execute("select count(*) from public.crawl_failures").fetchone() == (1,)


def test_incremental_crawl_stops_at_settled_events(conn: psycopg.Connection[Any], tmp_path: Path) -> None:
    pages = {
        LIST_URL.format(page=1): list_page(1000, "Sep 03 - 25, 2026"),
        LIST_URL.format(page=2): list_page(2000, "Feb 16 - 18, 2024"),
        LIST_URL.format(page=3): list_page(3000, "Feb 16 - 18, 2023"),
    }
    result = crawl_list(Pages(pages), conn, tmp_path, mode="incremental", cutoff=date(2026, 8, 1))
    assert result.pages == 2
    assert "page 2" in result.stopped


def test_recent_mlh_events_are_searched_by_name(conn: psycopg.Connection[Any], tmp_path: Path) -> None:
    conn.execute(
        "insert into public.mlh_events (source_id, season, name, slug, starts_at, ends_at, format)"
        " values ('test-a', '2027', 'Test Hacks', 'test-hacks', now() - interval '3 days',"
        "         now() - interval '2 days', 'physical'),"
        "        ('test-b', '2027', 'Old Hacks', 'test-old-hacks', now() - interval '400 days',"
        "         now() - interval '399 days', 'physical')"
    )
    pages = {SEARCH_URL.format(query="Test%20Hacks"): list_page(5000)}
    fetcher = Pages(pages)
    found = search_mlh_events(fetcher, conn, tmp_path, since=date.today() - timedelta(days=60))
    assert fetcher.requested == [SEARCH_URL.format(query="Test%20Hacks")]  # the old event isn't searched
    assert (found.searched, found.inserted, found.failed) == (1, 9, 0)


def test_mlh_crawl_and_matching(conn: psycopg.Connection[Any], tmp_path: Path) -> None:
    pages = {
        SEASON_URL.format(season=2025, page=1): read_fixture("mlh/season-2025_p1.html"),
        SEASON_URL.format(season=2025, page=2): read_fixture("mlh/season-2025_p10.html"),  # empty: stop
    }
    result = crawl_mlh_seasons(Pages(pages), conn, tmp_path, [2024, 2025])  # 2024 is a 404 here
    assert result.events_by_season == {"2025": 24}

    # A Devpost event for JAMHacks 9 (an MLH "High School Students Only" event), plus a decoy.
    jam_end = conn.execute(
        "select (ends_at at time zone 'utc')::date from public.mlh_events where slug = 'jamhacks-9'"
    )
    end = jam_end.fetchone()
    assert end is not None
    conn.execute(
        "insert into public.hackathons (source, source_id, slug, title, url, ends_on) values"
        " ('devpost', 'jam', 'jamhacks-9', 'JAMHacks 9', 'https://jamhacks-9.devpost.com/', %s),"
        " ('devpost', 'decoy', 'other-jam', 'Unrelated Jam', 'https://other-jam.devpost.com/', %s)",
        (end[0], end[0]),
    )
    conn.commit()
    counts = apply_matches(conn)
    assert counts["auto"] >= 1
    jam = conn.execute(
        "select is_mlh, is_high_school from public.hackathons where slug = 'jamhacks-9'"
    ).fetchone()
    assert jam == (True, True)  # the trigger applied MLH membership and the high-school flag
    shown = conn.execute(
        "select candidates from public.mlh_match_review where mlh_name = 'JAMHacks 9'"
    ).fetchone()
    assert shown is not None
    assert shown[0][0]["slug"] == "jamhacks-9"
    assert shown[0][0]["name_match"] == "exact"

    # An admin rejects the match; re-running matching must not undo that.
    conn.execute(
        "update public.mlh_event_matches set status = 'rejected', hackathon_id = null"
        " where mlh_event_id = (select id from public.mlh_events where slug = 'jamhacks-9')"
    )
    conn.commit()
    apply_matches(conn)
    status = conn.execute(
        "select m.status from public.mlh_event_matches m join public.mlh_events e on e.id = m.mlh_event_id"
        " where e.slug = 'jamhacks-9'"
    ).fetchone()
    assert status == ("rejected",)
    is_mlh = conn.execute(
        "select is_mlh, is_high_school from public.hackathons where slug = 'jamhacks-9'"
    ).fetchone()
    assert is_mlh == (False, True)  # no longer MLH, but the high-school flag is never cleared (§9)


def test_mlh_crawl_stops_when_a_page_adds_no_new_events(
    conn: psycopg.Connection[Any], tmp_path: Path
) -> None:
    # Past the end of the current season, pages still list every upcoming event.
    repeat = read_fixture("mlh/season-2027_p4.html")
    pages = {
        SEASON_URL.format(season=2027, page=1): read_fixture("mlh/season-2027_p3.html"),
        SEASON_URL.format(season=2027, page=2): repeat,
        SEASON_URL.format(season=2027, page=3): repeat,
    }
    client = Pages(pages)
    result = crawl_mlh_seasons(client, conn, tmp_path, [2027])
    assert client.requested == [SEASON_URL.format(season=2027, page=n) for n in (1, 2)]
    assert result.events_by_season == {"2027": 70}
    assert result.pages == 2
    stored = conn.execute("select count(*) from public.mlh_events where season = '2027'").fetchone()
    assert stored == (70,)


def test_mlh_crawl_falls_back_to_regional_seasons(conn: psycopg.Connection[Any], tmp_path: Path) -> None:
    pages = {
        SEASON_URL.format(season="na-2020", page=1): read_fixture("mlh/season-na-2020_p1.html"),
        SEASON_URL.format(season="na-2020", page=2): read_fixture("mlh/season-2025_p10.html"),  # empty
        SEASON_URL.format(season="eu-2020", page=1): read_fixture("mlh/season-eu-2020_p1.html"),
        # eu-2020 page 2 is a 404 here: stop that season
        SEASON_URL.format(season=2025, page=1): read_fixture("mlh/season-2025_p1.html"),
    }
    client = Pages(pages)
    result = crawl_mlh_seasons(client, conn, tmp_path, [2020, 2025])
    assert result.events_by_season == {"na-2020": 24, "eu-2020": 16, "2025": 24}
    assert SEASON_URL.format(season=2020, page=1) in client.requested
    # A year that has its own season page is never looked up regionally.
    assert not any("na-2025" in u or "eu-2025" in u for u in client.requested)
    seasons = dict(
        conn.execute(
            "select season, count(*) from public.mlh_events where season like '2020 %' group by season"
        ).fetchall()
    )
    assert seasons == {"2020 NA": 24, "2020 Europe": 16}
