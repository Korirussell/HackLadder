"""Crawl the Devpost hackathon list API into `hackathons` (§6.3, §6.4 step 1).

Pages are sorted by deadline (newest-ending first, after ~4 pinned featured events, §6.6).
Each page is stored raw, indexed, loaded and checkpointed before the next is fetched, so a
killed crawl resumes where it stopped.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal, Protocol

from hackladder.crawl.cache import store_raw
from hackladder.crawl.http import FetchFailedError, FetchResult
from hackladder.db import (
    Connection,
    clear_checkpoint,
    get_checkpoint,
    record_failure,
    record_raw_page,
    set_checkpoint,
)
from hackladder.load.hackathons import upsert_hackathons
from hackladder.parse import parse_hackathon_list

LIST_URL = "https://devpost.com/api/hackathons?status[]=ended&order_by=deadline&page={page}"
FULL_JOB = "list:full"

Mode = Literal["full", "incremental"]


class Fetcher(Protocol):
    def get(self, url: str) -> FetchResult: ...


@dataclass
class ListCrawlResult:
    first_page: int = 1
    pages: int = 0
    hackathons: int = 0
    inserted: int = 0
    updated: int = 0
    stopped: str = ""


def crawl_list(
    client: Fetcher,
    conn: Connection,
    raw_root: Path,
    *,
    mode: Mode = "full",
    cutoff: date | None = None,
    max_pages: int | None = None,
    restart: bool = False,
) -> ListCrawlResult:
    """``full`` walks every page, resuming from its checkpoint unless ``restart``.
    ``incremental`` starts at page 1 and stops at the first page where every event ended
    before ``cutoff`` (events we've already seen and that have settled)."""
    if mode == "incremental" and cutoff is None:
        raise ValueError("incremental mode needs a cutoff date")
    if restart:
        clear_checkpoint(conn, FULL_JOB)
    checkpoint = get_checkpoint(conn, FULL_JOB) if mode == "full" else None
    page = int(checkpoint["page"]) + 1 if checkpoint else 1
    result = ListCrawlResult(first_page=page)

    while True:
        if max_pages is not None and result.pages >= max_pages:
            result.stopped = f"reached --max-pages {max_pages}"
            break
        url = LIST_URL.format(page=page)
        try:
            fetched = client.get(url)
        except FetchFailedError as exc:
            record_failure(conn, url, "hackathon_list", exc.status, exc.error)
            conn.commit()
            result.stopped = f"page {page} kept failing ({exc.error}); rerun to resume"
            break
        path = store_raw(raw_root, url, fetched.text) if fetched.status == 200 else None
        record_raw_page(conn, url, "hackathon_list", fetched.status, str(path) if path else None)
        if fetched.status != 200:
            record_failure(conn, url, "hackathon_list", fetched.status, f"HTTP {fetched.status}")
            conn.commit()
            result.stopped = f"page {page} returned HTTP {fetched.status}"
            break

        listing = parse_hackathon_list(fetched.text)
        if not listing.hackathons:
            if mode == "full":
                clear_checkpoint(conn, FULL_JOB)
            conn.commit()
            result.stopped = "end of the list"
            break

        counts = upsert_hackathons(conn, listing.hackathons)
        result.pages += 1
        result.hackathons += len(listing.hackathons)
        result.inserted += counts.inserted
        result.updated += counts.updated
        if mode == "full":
            set_checkpoint(conn, FULL_JOB, {"page": page, "total_count": listing.total_count})
        conn.commit()

        if (
            mode == "incremental"
            and cutoff is not None
            and all(h.ends_on is not None and h.ends_on < cutoff for h in listing.hackathons)
        ):
            result.stopped = f"every event on page {page} ended before {cutoff}"
            break
        page += 1
    return result
