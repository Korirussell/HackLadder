"""Crawl one event from fixtures, load it, rate it, publish (pytest -m db)."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import psycopg
import pytest
from conftest import read_fixture

from hackladder.config import load_rating_config, seed_prize_rules
from hackladder.crawl.events import crawl_events
from hackladder.crawl.http import FetchResult
from hackladder.rate.run import run_ratings, season_of

pytestmark = [
    pytest.mark.db,
    pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="needs DATABASE_URL"),
]

BASE = "https://treehacks-2024.devpost.com/project-gallery?page="
PROJECTS = ["baymax-your-personal-healthcare-companion", "dockerc", "lingua-franca-6xovi3", "palate-pals"]


class FixtureCache:
    def __init__(self) -> None:
        self.pages = {
            f"{BASE}1": read_fixture("gallery/treehacks-2024_p1.html"),
            f"{BASE}2": read_fixture("gallery/treehacks-2024_p14.html"),  # stands in for the last page
            **{f"https://devpost.com/software/{s}": read_fixture(f"project/{s}.html") for s in PROJECTS},
        }

    def get(self, url: str, max_age: timedelta | None = None) -> FetchResult:
        text = self.pages.get(url)
        return FetchResult(url, 200 if text is not None else 404, text or "", 0.0)

    def path_for(self, url: str) -> Path:
        return Path("fixtures") / url.rsplit("/", 1)[-1]


@pytest.fixture
def conn() -> Iterator[psycopg.Connection[Any]]:
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c
        c.rollback()
        for sql in [
            "delete from public.ratings",
            "delete from public.rating_history",
            "delete from public.hackathons where source = 'devpost'",
            "delete from public.people where slug not like 'sample-%'",
            "delete from public.event_series where slug = 'treehacks'",
            "delete from public.prize_tier_rules",
            "delete from public.crawl_checkpoints",
            "delete from public.crawl_failures",
            "delete from public.raw_pages_index",
            "delete from public.pipeline_runs",
        ]:
            c.execute(sql)
        c.commit()


def test_crawl_load_rate_publish(conn: psycopg.Connection[Any]) -> None:
    seed_prize_rules(conn)
    conn.execute(
        "insert into public.hackathons"
        " (source, source_id, slug, title, url, ends_on, is_mlh, winners_announced)"
        " values ('devpost', '19000', 'treehacks-2024', 'TreeHacks 2024', 'https://treehacks-2024.devpost.com/',"
        " '2024-02-18', true, true)"
    )
    conn.commit()

    result = crawl_events(FixtureCache(), conn, load_rating_config(conn).prize_tiers, today=date(2026, 10, 1))
    assert (result.events, result.projects) == (1, 4)
    missing = conn.execute("select count(*) from public.crawl_failures where kind = 'project'").fetchone()
    assert missing == (24 + 19 - 4,)  # every gallery entry without a saved fixture is a recorded 404

    def q(sql: str) -> tuple[Any, ...] | None:
        return conn.execute(sql).fetchone()

    assert q("select count(*) from public.projects where source = 'devpost'") == (4,)
    assert q("select anonymous_members from public.projects where source_id = 'palate-pals'") == (1,)
    assert q("select tier from public.prizes_won w join public.projects p on p.id = w.project_id"
             " where p.source_id = 'lingua-franca-6xovi3'") == (2,)  # fmt: skip
    assert q("select count(*) from public.accounts where source = 'devpost'") == (9,)

    summary = run_ratings(conn)
    assert (summary.events, summary.people, summary.ranked) == (1, 9, 0)  # one event: everyone provisional
    assert q("select count(*) from public.ratings") == (9,)
    assert q("select count(*) from public.ratings_next") == (0,)  # swapped in and cleared
    best = q("select a.source_id from public.ratings r join public.accounts a on a.person_id = r.person_id"
             " order by r.score desc limit 1")  # fmt: skip
    assert best is not None
    assert best[0] in {
        "aaravwattal",
        "krishparikh",
        "jamesc27",
        "jaykhem",
    }
    assert q("select series_id is not null from public.hackathons where slug = 'treehacks-2024'") == (True,)
    snap = q(
        "select config_snapshot -> 'prize_rules' -> 0 ->> 'name' from public.pipeline_runs where job = 'rate'"
    )
    assert snap == ("not a placement",)

    again = crawl_events(FixtureCache(), conn, load_rating_config(conn).prize_tiers, today=date(2026, 10, 1))
    assert (again.events, again.skipped) == (0, 1)  # settled event already crawled


@pytest.mark.parametrize(("d", "season"), [(date(2025, 8, 1), "2025-26"), (date(2026, 7, 31), "2025-26")])
def test_season_of(d: date, season: str) -> None:
    assert season_of(d) == season
