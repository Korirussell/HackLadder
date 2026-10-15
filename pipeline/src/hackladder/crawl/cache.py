"""Local gzipped raw-page cache, keyed by URL hash.

This is the on-disk twin of the ``raw-pages`` Supabase bucket (§6.2): pages are
stored exactly as fetched so parsers can be re-run with zero new requests.
"""

from __future__ import annotations

import gzip
import hashlib
import time
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path

from hackladder.crawl.http import FetchResult, PoliteClient


def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def raw_path(root: Path, url: str) -> Path:
    """Where ``url``'s page lives under ``root``: sharded by the first two hex chars of its hash."""
    h = url_hash(url)
    return root / h[:2] / f"{h}.gz"


def store_raw(root: Path, url: str, text: str) -> Path:
    """Store a page gzipped under ``root``, replacing any earlier copy; returns its path."""
    path = raw_path(root, url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(text.encode("utf-8")))
    return path


class CachedFetcher:
    """Serves pages from ``root`` when present (and fresh enough), otherwise fetches politely
    and stores them.

    Only 200 responses are cached; a 404 is returned to the caller but re-checked next run.
    """

    def __init__(self, client: PoliteClient, root: Path) -> None:
        self._client = client
        self._root = root
        self.hits = 0

    def path_for(self, url: str) -> Path:
        return raw_path(self._root, url)

    def get(self, url: str, max_age: timedelta | None = None) -> FetchResult:
        """``max_age`` refetches a cached page older than that (§6.2 freshness windows)."""
        path = self.path_for(url)
        fresh = path.exists() and (
            max_age is None or time.time() - path.stat().st_mtime < max_age.total_seconds()
        )
        if fresh:
            self.hits += 1
            text = gzip.decompress(path.read_bytes()).decode("utf-8")
            return FetchResult(url=url, status=200, text=text, fetched_at=path.stat().st_mtime)
        result = self._client.get(url)
        if result.status == 200:
            store_raw(self._root, url, result.text)
        return result


def iter_cached_pages(root: Path) -> Iterator[str]:
    """Every page stored under ``root``, ordered by URL hash. Makes no requests."""
    for path in sorted(root.rglob("*.gz")):
        yield gzip.decompress(path.read_bytes()).decode("utf-8")
