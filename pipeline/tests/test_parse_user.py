from __future__ import annotations

import pytest
from conftest import read_fixture

from hackladder.parse import NotAUserPageError, ParseError, UserPage, parse_user


def test_user_with_bio_and_location() -> None:
    assert parse_user(read_fixture("user/aaravwattal.html")) == UserPage(
        username="aaravwattal",
        display_name="Aarav Wattal",
        bio="EE+CS @ Stanford",
        location="California, United States",
    )


def test_user_with_non_ascii_name_and_no_bio() -> None:
    assert parse_user(read_fixture("user/NilsIrl.html")) == UserPage(
        username="NilsIrl",
        display_name="Nils Andr\N{LATIN SMALL LETTER E WITH ACUTE}",
        bio=None,
        location="Cambridge, England, United Kingdom",
    )


def test_user_without_a_display_name() -> None:
    # Devpost shows the username in place of a missing name.
    page = parse_user(read_fixture("user/dylanjpaulson.html"))
    assert page.username == page.display_name == "dylanjpaulson"
    assert page.location == "Minneapolis, Minnesota, United States"


def test_links_are_never_parsed() -> None:
    # NilsIrl lists a website and GitHub; those come only from the owner after claiming (§9.3).
    assert not hasattr(parse_user(read_fixture("user/NilsIrl.html")), "links")


def test_project_page_is_not_a_user_page() -> None:
    with pytest.raises(NotAUserPageError):
        parse_user(read_fixture("project/dockerc.html"))


def test_heading_without_username_raises() -> None:
    with pytest.raises(ParseError, match=r"no \(username\)"):
        parse_user('<h1 id="portfolio-user-name">Someone</h1>')
