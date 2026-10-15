"""Crawl galleries and project pages for in-scope events (§6.4 step 3).

Events are taken from `hackathon_scope` (is_rated, winners announced), newest first. A finished
event is checkpointed and skipped next time, unless it ended in the last 60 days, when winners
and edits may still change (§6.2). Each project page is fetched once and cached.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Protocol

from hackladder.crawl.http import FetchFailedError, FetchResult
from hackladder.db import Connection, get_checkpoint, record_failure, record_raw_page, set_checkpoint
from hackladder.load.projects import load_project
from hackladder.parse import ParseError, parse_gallery, parse_project
from hackladder.prizes import TierConfig

SETTLE_DAYS = 60
RECENT_MAX_AGE = timedelta(days=7)  # how stale a recent event's cached pages may be
MAX_GALLERY_PAGES = 200


class Fetcher(Protocol):
    """A cached, polite fetcher (CachedFetcher in production)."""

    def get(self, url: str, max_age: timedelta | None = None) -> FetchResult: ...
    def path_for(self, url: str) -> Path: ...


@dataclass
class EventCrawlResult:
    events: int = 0
    projects: int = 0
    skipped: int = 0
    failures: list[str] = field(default_factory=list)


def _events(conn: Connection, slugs: list[str] | None) -> list[tuple[int, str, date | None]]:
    if slugs:
        rows = conn.execute(
            "select hackathon_id, slug, ends_on from public.hackathon_scope where slug = any(%s)", (slugs,)
        ).fetchall()
    else:
        rows = conn.execute(
            "select s.hackathon_id, s.slug, s.ends_on from public.hackathon_scope s"
            " join public.hackathons h on h.id = s.hackathon_id"
            " where s.is_rated and h.winners_announced order by s.ends_on desc nulls last"
        ).fetchall()
    return [(int(r[0]), str(r[1]), r[2]) for r in rows]


def crawl_events(
    fetcher: Fetcher,
    conn: Connection,
    tiers: TierConfig,
    *,
    slugs: list[str] | None = None,
    limit: int | None = None,
    today: date | None = None,
) -> EventCrawlResult:
    today = today or date.today()
    result = EventCrawlResult()
    for hackathon_id, slug, ends_on in _events(conn, slugs):
        if limit is not None and result.events >= limit:
            break
        recent = ends_on is None or (today - ends_on).days < SETTLE_DAYS
        job = f"event:{hackathon_id}"
        if not slugs and not recent and get_checkpoint(conn, job):
            result.skipped += 1
            continue
        max_age = RECENT_MAX_AGE if recent else None
        base, host = f"https://{slug}.devpost.com/", f"{slug}.devpost.com"
        loaded = 0
        try:
            for page_no in range(1, MAX_GALLERY_PAGES + 1):
                url = f"{base}project-gallery?page={page_no}"
                fetched = fetcher.get(url, max_age=max_age)
                record_raw_page(conn, url, "gallery", fetched.status, str(fetcher.path_for(url)))
                if fetched.status != 200:
                    raise FetchFailedError(url, fetched.status, f"HTTP {fetched.status}", 1)
                gallery = parse_gallery(fetched.text)
                for entry in gallery.entries:
                    purl = f"https://devpost.com/software/{entry.slug}"
                    project = fetcher.get(purl, max_age=max_age)
                    record_raw_page(conn, purl, "project", project.status, str(fetcher.path_for(purl)))
                    if project.status != 200:
                        record_failure(conn, purl, "project", project.status, f"HTTP {project.status}")
                        continue
                    try:
                        load_project(
                            conn, hackathon_id, slug, entry, parse_project(project.text, host), tiers=tiers
                        )
                        loaded += 1
                    except ParseError as exc:
                        record_failure(conn, purl, "project", 200, f"parse error: {exc}")
                conn.commit()
                if not gallery.entries or not gallery.has_next:
                    break
        except (FetchFailedError, ParseError) as exc:
            conn.rollback()
            record_failure(conn, base, "gallery", getattr(exc, "status", None), str(exc))
            conn.commit()
            result.failures.append(f"{slug}: {exc}")
            continue
        set_checkpoint(conn, job, {"projects": loaded, "crawled_on": today.isoformat()})
        conn.commit()
        result.events += 1
        result.projects += loaded
    return result
