from __future__ import annotations

from datetime import date

import pytest
from bs4 import BeautifulSoup

from hackladder.parse import parse_date_range, parse_usd
from hackladder.parse.common import host_of, text_of, username_from_url


@pytest.mark.parametrize(
    ("raw", "start", "end"),
    [
        ("Aug 21 - Oct 02, 2026", date(2026, 8, 21), date(2026, 10, 2)),
        ("Feb 16 - 18, 2024", date(2024, 2, 16), date(2024, 2, 18)),
        ("Dec 28, 2025 - Jan 02, 2026", date(2025, 12, 28), date(2026, 1, 2)),
        ("Dec 28 - Jan 02, 2026", date(2025, 12, 28), date(2026, 1, 2)),  # year implied by month order
        ("Apr 05, 2024", date(2024, 4, 5), date(2024, 4, 5)),
        ("Sept 3 \N{EN DASH} 25, 2026", date(2026, 9, 3), date(2026, 9, 25)),
    ],
)
def test_parse_date_range(raw: str, start: date, end: date) -> None:
    assert parse_date_range(raw) == (start, end)


@pytest.mark.parametrize("raw", [None, "", "TBD", "Foo 12 - 13, 2024", "Feb 30 - 31, 2024"])
def test_parse_date_range_rejects_garbage(raw: str | None) -> None:
    assert parse_date_range(raw) == (None, None)


@pytest.mark.parametrize(
    ("raw", "usd"),
    [
        ("$<span data-currency-value>1,024</span>", 1024),
        ("$<span data-currency-value>0</span>", 0),
        # Real non-dollar values seen in the list API (Oct 2026): rupees and euros aren't USD.
        ("\N{INDIAN RUPEE SIGN} <span data-currency-value>1,475,001</span>", None),
        ("\N{EURO SIGN}<span data-currency-value>26,200</span>", None),
        (None, None),
    ],
)
def test_parse_usd(raw: str | None, usd: int | None) -> None:
    assert parse_usd(raw) == usd


@pytest.mark.parametrize(
    ("url", "username"),
    [
        ("https://devpost.com/aaravwattal", "aaravwattal"),
        ("https://devpost.com/NilsIrl/", "NilsIrl"),
        ("https://devpost.com/software/dockerc", None),
        ("https://devpost.com/software/built-with/zig", None),
        ("https://treehacks-2024.devpost.com/", None),
        (None, None),
    ],
)
def test_username_from_url(url: str | None, username: str | None) -> None:
    assert username_from_url(url) == username


def test_host_of() -> None:
    assert (
        host_of("https://TreeHacks-2024.devpost.com/project-gallery?page=2") == "treehacks-2024.devpost.com"
    )
    assert host_of("treehacks-2024.devpost.com") == "treehacks-2024.devpost.com"


@pytest.mark.parametrize("raw", ["Feb 16 - 18 - 20, 2024", "16 - 18, 2024", "Feb 16 - 18"])
def test_parse_date_range_needs_two_parts_a_start_month_and_an_end_year(raw: str) -> None:
    assert parse_date_range(raw) == (None, None)


def test_text_of_missing_or_blank() -> None:
    assert text_of(None) is None
    assert text_of(BeautifulSoup("<p>  \n </p>", "html.parser").p) is None
    assert text_of(BeautifulSoup("<p> a \n  b </p>", "html.parser").p) == "a b"
