"""MLH season crawl and Devpost matching against the database (§6.1, §8.7)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from hackladder.crawl.cache import store_raw
from hackladder.crawl.http import FetchFailedError, FetchResult
from hackladder.db import Connection, record_failure, record_raw_page
from hackladder.mlh_match import DevpostRow, MlhRow, match_all
from hackladder.parse import MlhEvent, parse_mlh_season

SEASON_URL = "https://mlh.io/seasons/{season}/events?page={page}"
MAX_PAGES_PER_SEASON = 40  # ~10 in practice; a guard against an endless loop if paging changes


class Fetcher(Protocol):
    def get(self, url: str) -> FetchResult: ...


@dataclass
class MlhCrawlResult:
    events_by_season: dict[str, int] = field(default_factory=dict)
    pages: int = 0
    failures: list[str] = field(default_factory=list)


_UPSERT = """
insert into public.mlh_events
  (source_id, slug, name, season, starts_at, ends_at, format, location, country, website_url,
   is_high_school, underserved_types)
values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
on conflict (source_id) do update set
  slug = excluded.slug, name = excluded.name, season = excluded.season, starts_at = excluded.starts_at,
  ends_at = excluded.ends_at, format = excluded.format, location = excluded.location,
  country = excluded.country, website_url = excluded.website_url,
  is_high_school = excluded.is_high_school, underserved_types = excluded.underserved_types
"""


def upsert_mlh_events(conn: Connection, season: str, events: Iterable[MlhEvent]) -> int:
    n = 0
    with conn.cursor() as cur:
        for e in events:
            cur.execute(
                _UPSERT,
                (e.source_id, e.slug, e.name, season, e.starts_at, e.ends_at, e.format, e.location,
                 e.country, e.website_url, e.is_high_school, list(e.underserved_types)),
            )  # fmt: skip
            n += 1
    return n


def crawl_mlh_seasons(
    client: Fetcher, conn: Connection, raw_root: Path, seasons: Iterable[int]
) -> MlhCrawlResult:
    result = MlhCrawlResult()
    for season in seasons:
        total = 0
        for page in range(1, MAX_PAGES_PER_SEASON + 1):
            url = SEASON_URL.format(season=season, page=page)
            try:
                fetched = client.get(url)
            except FetchFailedError as exc:
                record_failure(conn, url, "mlh_season", exc.status, exc.error)
                result.failures.append(f"{url}: {exc.error}")
                break
            record_raw_page(
                conn, url, "mlh_season", fetched.status,
                str(store_raw(raw_root, url, fetched.text)) if fetched.status == 200 else None,
            )  # fmt: skip
            if fetched.status != 200:
                break  # seasons MLH never ran return 404
            parsed = parse_mlh_season(fetched.text)
            result.pages += 1
            if not parsed.events:
                break
            total += upsert_mlh_events(conn, parsed.season, parsed.events)
            conn.commit()
        if total:
            result.events_by_season[str(season)] = total
        conn.commit()
    return result


def apply_matches(conn: Connection) -> Counter[str]:
    """Match every MLH event to a Devpost hackathon and store the decision.

    Rows an admin confirmed or rejected are left alone; everything else is recomputed, so a
    better Devpost crawl improves earlier automatic decisions.
    """
    mlh_rows = [
        MlhRow(id=r[0], name=r[1], slug=r[2], ends_on=r[3], website_url=r[4])
        for r in conn.execute(
            "select id, name, slug, (ends_at at time zone 'utc')::date, website_url from public.mlh_events"
        ).fetchall()
    ]
    dev_rows = [
        DevpostRow(id=r[0], title=r[1], slug=r[2], ends_on=r[3])
        for r in conn.execute(
            "select id, title, slug, ends_on from public.hackathons"
            " where source = 'devpost' and ends_on is not null"
        ).fetchall()
    ]
    counts: Counter[str] = Counter()
    with conn.cursor() as cur:
        for d in match_all(mlh_rows, dev_rows):
            cur.execute(
                "insert into public.mlh_event_matches (mlh_event_id, hackathon_id, score, status, note)"
                " values (%s, %s, %s, %s, %s)"
                " on conflict (mlh_event_id) do update set hackathon_id = excluded.hackathon_id,"
                " score = excluded.score, status = excluded.status, note = excluded.note"
                " where mlh_event_matches.status not in ('confirmed', 'rejected')",
                (d.mlh_event_id, d.hackathon_id, d.score, d.status, d.note),
            )
            counts[d.status] += 1
    conn.commit()
    return counts
