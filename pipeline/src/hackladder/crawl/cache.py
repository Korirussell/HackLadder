"""Local gzipped raw-page cache, keyed by URL hash.

This is the on-disk twin of the ``raw-pages`` Supabase bucket (§6.2): pages are
stored exactly as fetched so parsers can be re-run with zero new requests.
"""

from __future__ import annotations

import gzip
import hashlib
from collections.abc import Iterator
from pathlib import Path

from hackladder.crawl.http import FetchResult, PoliteClient


def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


class CachedFetcher:
    """Serves pages from ``root`` when present, otherwise fetches politely and stores them.

    Only 200 responses are cached; a 404 is returned to the caller but re-checked next run.
    """

    def __init__(self, client: PoliteClient, root: Path) -> None:
        self._client = client
        self._root = root
        self.hits = 0

    def _path(self, url: str) -> Path:
        h = url_hash(url)
        return self._root / h[:2] / f"{h}.gz"

    def get(self, url: str) -> FetchResult:
        path = self._path(url)
        if path.exists():
            self.hits += 1
            text = gzip.decompress(path.read_bytes()).decode("utf-8")
            return FetchResult(url=url, status=200, text=text, fetched_at=path.stat().st_mtime)
        result = self._client.get(url)
        if result.status == 200:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(gzip.compress(result.text.encode("utf-8")))
        return result


def iter_cached_pages(root: Path) -> Iterator[str]:
    """Every page stored under ``root``, ordered by URL hash. Makes no requests."""
    for path in sorted(root.rglob("*.gz")):
        yield gzip.decompress(path.read_bytes()).decode("utf-8")
