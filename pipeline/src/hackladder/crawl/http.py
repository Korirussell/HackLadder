"""Polite HTTP client for devpost.com (CLAUDE.md §6.2).

One request at a time, at least ``min_interval`` seconds apart across every
host this client talks to, a real User-Agent, and exponential back-off on 429
and 5xx. A URL that keeps failing raises :class:`FetchFailedError` so the
caller can record it in ``crawl_failures``.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from urllib import robotparser

import httpx

log = logging.getLogger(__name__)

USER_AGENT = "HackLadderBot/1.0 (+https://hackladder.com/bot)"
MIN_INTERVAL_S = 1.5
BACKOFF_S: tuple[float, ...] = (10, 20, 40)
ROBOTS_URL = "https://devpost.com/robots.txt"


@dataclass(frozen=True, slots=True)
class FetchResult:
    url: str
    status: int
    text: str
    fetched_at: float


class FetchFailedError(Exception):
    """Raised after the back-off schedule is exhausted for a URL."""

    def __init__(self, url: str, status: int | None, error: str, attempts: int) -> None:
        super().__init__(f"{url}: {error} after {attempts} attempts")
        self.url = url
        self.status = status
        self.error = error
        self.attempts = attempts


class RobotsDisallowedError(Exception):
    pass


def _retryable(status: int) -> bool:
    return status == 429 or status >= 500


class PoliteClient:
    """Rate-limited, retrying GET client. Not thread-safe by design: one request at a time."""

    def __init__(
        self,
        *,
        min_interval: float = MIN_INTERVAL_S,
        backoff: Sequence[float] = BACKOFF_S,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._http = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            timeout=30.0,
            follow_redirects=True,
            transport=transport,
        )
        self._min_interval = min_interval
        self._backoff = tuple(backoff)
        self._sleep = sleep
        self._clock = clock
        self._last_request: float | None = None
        self._robots: robotparser.RobotFileParser | None = None
        self.requests_made = 0

    def __enter__(self) -> PoliteClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    def _throttle(self) -> None:
        if self._last_request is not None:
            wait = self._min_interval - (self._clock() - self._last_request)
            if wait > 0:
                self._sleep(wait)
        self._last_request = self._clock()

    def _get_once(self, url: str) -> httpx.Response:
        self._throttle()
        self.requests_made += 1
        return self._http.get(url)

    def load_robots(self) -> str:
        """Fetch robots.txt, remember its rules, and return the raw text for logging."""
        resp = self._get_once(ROBOTS_URL)
        parser = robotparser.RobotFileParser(ROBOTS_URL)
        text = resp.text if resp.status_code == 200 else ""
        parser.parse(text.splitlines())
        self._robots = parser
        log.info("robots.txt (%s):\n%s", resp.status_code, text.strip())
        return text

    def get(self, url: str) -> FetchResult:
        """GET ``url``. Returns 2xx and 4xx responses; raises after repeated 429/5xx/network errors."""
        if self._robots is not None and not self._robots.can_fetch(USER_AGENT, url):
            raise RobotsDisallowedError(url)

        status: int | None = None
        error = ""
        attempts = 0
        for delay in (*self._backoff, None):
            attempts += 1
            try:
                resp = self._get_once(url)
            except httpx.TransportError as exc:
                status, error = None, f"{type(exc).__name__}: {exc}"
            else:
                status = resp.status_code
                if not _retryable(status):
                    return FetchResult(url=url, status=status, text=resp.text, fetched_at=time.time())
                error = f"HTTP {status}"
            if delay is None:
                break
            log.warning("%s on %s; retrying in %ss", error, url, delay)
            self._sleep(delay)
        raise FetchFailedError(url, status, error, attempts)
