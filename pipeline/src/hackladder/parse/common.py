"""Small parsing helpers shared by the page parsers."""

from __future__ import annotations

import re
from datetime import date

from bs4 import BeautifulSoup, Tag

from hackladder.parse.models import MemberKind


class ParseError(ValueError):
    """The page doesn't have the structure the parser was written against.

    Raised instead of guessing, so markup changes surface in ``hl check`` and in
    ``crawl_failures`` rather than as silently wrong data.
    """


_MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1
    )
}

# "Aug 21", "Aug 21, 2026", or just "18, 2024" (end of a same-month range).
_DATE_PART = re.compile(r"^(?:(?P<mon>[A-Za-z]{3})[A-Za-z]*\.?\s+)?(?P<day>\d{1,2})(?:,\s*(?P<year>\d{4}))?$")


def _part(s: str) -> tuple[int | None, int, int | None] | None:
    m = _DATE_PART.match(s.strip())
    if not m:
        return None
    mon = _MONTHS.get(m["mon"].lower()[:3]) if m["mon"] else None
    if m["mon"] and mon is None:
        return None
    return mon, int(m["day"]), int(m["year"]) if m["year"] else None


def parse_date_range(s: str | None) -> tuple[date | None, date | None]:
    """Parse Devpost's ``submission_period_dates`` into (start, end).

    Handles ``Aug 21 - Oct 02, 2026``, ``Feb 16 - 18, 2024``,
    ``Dec 28, 2025 - Jan 02, 2026`` and a single ``Apr 05, 2024``.
    """
    if not s:
        return None, None
    pieces = [p for p in re.split(r"\s+[-\N{EN DASH}]\s+", s.strip()) if p]
    if len(pieces) == 1:
        pieces = pieces * 2
    if len(pieces) != 2:
        return None, None
    start, end = _part(pieces[0]), _part(pieces[1])
    if not start or not end:
        return None, None
    s_mon, s_day, s_year = start
    e_mon, e_day, e_year = end
    if s_mon is None or e_year is None:
        return None, None
    e_mon = e_mon or s_mon
    if s_year is None:
        s_year = e_year - 1 if s_mon > e_mon else e_year
    try:
        return date(s_year, s_mon, s_day), date(e_year, e_mon, e_day)
    except ValueError:
        return None, None


def parse_usd(html_str: str | None) -> int | None:
    """``$<span data-currency-value>1,024</span>`` -> 1024. Non-dollar amounts -> None."""
    text = BeautifulSoup(html_str or "", "html.parser").get_text().strip()
    if not text.startswith("$"):
        return None
    digits = re.sub(r"[^\d.]", "", text).split(".")[0]
    return int(digits) if digits else 0


NOT_A_PLACEMENT = 5

_TIER_RULES: tuple[tuple[int, re.Pattern[str]], ...] = (
    (NOT_A_PLACEMENT, re.compile(r"\b(raffle|participation|attendance)\b")),
    (1, re.compile(r"\b(grand|overall|1st|first)\b|best overall|winner$|^winner")),
    (2, re.compile(r"\b(2nd|3rd|second|third|runner[- ]?up|finalist)\b")),
    (4, re.compile(r"\b(best use of|sponsor|powered by|mlh|api|built with|using)\b")),
)

# Organizers often put the reward in the prize name: "Best Use of X ($1k Cash [1st] & ...)".
_REWARD_DESCRIPTION = re.compile(r"\([^()]*\)|\[[^\[\]]*\]")


def prize_tier(name: str) -> int:
    """1 grand/1st, 2 runner-up, 3 track prize (default), 4 sponsor/tech prize,
    5 not a placement (raffles, participation). See §6.5.

    Classifies on the name with parenthesized/bracketed reward descriptions removed,
    so "[1st]" inside a sponsor prize's reward list doesn't make it a grand prize.
    """
    n = _REWARD_DESCRIPTION.sub(" ", _REWARD_DESCRIPTION.sub(" ", name)).lower().strip()
    for tier, pat in _TIER_RULES:
        if pat.search(n):
            return tier
    return 3


def text_of(el: Tag | None) -> str | None:
    """Whitespace-collapsed text of ``el``, or None when missing or empty."""
    if el is None:
        return None
    t = " ".join(el.get_text(" ", strip=True).split())
    return t or None


def username_from_url(url: str | None) -> str | None:
    """``https://devpost.com/jdoe`` -> ``jdoe``; anything else -> None."""
    if not url:
        return None
    m = re.match(r"^https?://(?:www\.)?devpost\.com/([A-Za-z0-9_\-.]+)/?(?:[?#].*)?$", url.strip())
    if not m or m.group(1).lower() in _RESERVED_PATHS:
        return None
    return m.group(1)


_RESERVED_PATHS = frozenset(
    {"software", "hackathons", "settings", "users", "about", "help", "portfolio", "api", "c"}
)


def anonymous_member_kind(el: Tag) -> MemberKind | None:
    """Devpost wraps anonymous members in ``<span title="This user is in private mode">``
    or ``<span title="This user has been deleted">``."""
    if el.select_one("[title*='private mode' i]") is not None:
        return "private"
    if el.select_one("[title*='been deleted' i]") is not None:
        return "deleted"
    return None


def host_of(url: str) -> str:
    return re.sub(r"^https?://", "", url.strip()).split("/")[0].lower()
