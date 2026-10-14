from __future__ import annotations

import gzip
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from hackladder.crawl.cache import CachedFetcher
from hackladder.crawl.http import (
    USER_AGENT,
    FetchFailedError,
    PoliteClient,
    RobotsDisallowedError,
)


class FakeClock:
    """Time only moves when the client sleeps (or a test advances it)."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def time(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def make_client(
    handler: Callable[[httpx.Request], httpx.Response], clock: FakeClock, **kw: object
) -> PoliteClient:
    return PoliteClient(
        transport=httpx.MockTransport(handler),
        sleep=clock.sleep,
        clock=clock.time,
        **kw,  # type: ignore[arg-type]
    )


def test_sends_user_agent_and_spaces_requests() -> None:
    seen: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req.headers["user-agent"])
        return httpx.Response(200, text="ok")

    clock = FakeClock()
    with make_client(handler, clock) as client:
        for _ in range(3):
            assert client.get("https://devpost.com/a").status == 200
        assert client.requests_made == 3
    assert seen == [USER_AGENT] * 3
    assert clock.sleeps == [1.5, 1.5]  # never waits before the first request


def test_no_extra_wait_when_caller_was_already_slow() -> None:
    clock = FakeClock()
    with make_client(lambda _: httpx.Response(200), clock) as client:
        client.get("https://devpost.com/a")
        clock.now += 5
        client.get("https://devpost.com/b")
    assert clock.sleeps == []


def test_backs_off_on_429_and_5xx_then_succeeds() -> None:
    statuses = iter([429, 503, 200])
    clock = FakeClock()
    with make_client(lambda _: httpx.Response(next(statuses), text="done"), clock) as client:
        result = client.get("https://devpost.com/x")
    assert result.status == 200
    assert result.text == "done"
    assert [s for s in clock.sleeps if s >= 10] == [10, 20]


def test_gives_up_after_the_backoff_schedule() -> None:
    clock = FakeClock()
    with make_client(lambda _: httpx.Response(500), clock) as client, pytest.raises(FetchFailedError) as err:
        client.get("https://devpost.com/x")
    assert err.value.status == 500
    assert err.value.attempts == 4
    assert [s for s in clock.sleeps if s >= 10] == [10, 20, 40]


def test_network_errors_are_retried() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ConnectError("boom", request=req)
        return httpx.Response(200)

    with make_client(handler, FakeClock()) as client:
        assert client.get("https://devpost.com/x").status == 200
    assert calls == 2


def test_404_is_returned_not_raised() -> None:
    with make_client(lambda _: httpx.Response(404), FakeClock()) as client:
        assert client.get("https://devpost.com/nobody").status == 404


def test_robots_rules_are_honored() -> None:
    robots = "User-agent: *\nDisallow: /private\n\nUser-agent: Bytespider\nDisallow: /\n"

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=robots if req.url.path == "/robots.txt" else "page")

    with make_client(handler, FakeClock()) as client:
        assert client.load_robots() == robots
        assert client.get("https://devpost.com/software/x").status == 200
        with pytest.raises(RobotsDisallowedError):
            client.get("https://devpost.com/private/thing")


def test_cache_serves_repeat_fetches_without_requests(tmp_path: Path) -> None:
    clock = FakeClock()
    responses = {"https://devpost.com/a": 200, "https://devpost.com/gone": 404}
    with make_client(lambda req: httpx.Response(responses[str(req.url)], text="<p>a</p>"), clock) as client:
        fetcher = CachedFetcher(client, tmp_path)
        assert fetcher.get("https://devpost.com/a").text == "<p>a</p>"
        assert fetcher.get("https://devpost.com/a").text == "<p>a</p>"
        assert fetcher.get("https://devpost.com/gone").status == 404
        assert fetcher.get("https://devpost.com/gone").status == 404
        assert client.requests_made == 3  # one for /a, two for the uncached 404
        assert fetcher.hits == 1
    stored = list(tmp_path.rglob("*.gz"))
    assert len(stored) == 1
    assert gzip.decompress(stored[0].read_bytes()) == b"<p>a</p>"
