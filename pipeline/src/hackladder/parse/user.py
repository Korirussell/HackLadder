"""Public user page: ``https://devpost.com/<username>``."""

from __future__ import annotations

from bs4 import BeautifulSoup

from hackladder.parse.common import ParseError, text_of
from hackladder.parse.models import UserPage


class NotAUserPageError(ParseError):
    pass


def parse_user(html: str) -> UserPage:
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.select_one("#portfolio-user-name")
    if heading is None:
        raise NotAUserPageError("no #portfolio-user-name element")

    # <h1>Display Name <small>(username)</small></h1>
    small = heading.select_one("small")
    username = (text_of(small) or "").strip("()").strip()
    if small is None or not username:
        raise ParseError("user heading has no (username)")
    small.decompose()

    return UserPage(
        username=username,
        display_name=text_of(heading) or username,
        bio=text_of(soup.select_one("#portfolio-user-bio")),
        location=text_of(soup.select_one("#portfolio-user-links li:has(.ss-location)")),
    )
