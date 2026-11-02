"""Add-me lookup: pure parts (spec 2026-10-29-find-yourself)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from conftest import read_fixture

from hackladder.add import ScopeRow, classify, portfolio_projects
from hackladder.crawl.http import FetchResult


def row(**kw: object) -> ScopeRow:
    base = {
        "slug": "e",
        "title": "E",
        "ends_on": "2026-01-01",
        "is_online": False,
        "is_mlh": True,
        "is_high_school": False,
        "winners_announced": True,
        "is_rated": True,
        "loaded": False,
    }
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
    assert slugs is not None
    assert len(slugs) == 30
    assert slugs[0] == "vamped"
    assert pages.requested == ["https://devpost.com/jemsbhai", "https://devpost.com/jemsbhai?page=2"]


def test_portfolio_of_a_missing_user_is_none() -> None:
    assert portfolio_projects(Pages({}), "nobody-here") is None


def test_a_devpost_page_that_isnt_a_user_is_none() -> None:
    # devpost.com/software exists but is the global project gallery, not a portfolio
    gallery = "<html><body><div class='gallery-item'></div></body></html>"
    assert portfolio_projects(Pages({"https://devpost.com/software": gallery}), "software") is None
