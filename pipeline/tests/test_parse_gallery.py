from __future__ import annotations

import pytest
from conftest import read_fixture

from hackladder.parse import Member, ParseError, parse_gallery


def test_big_gallery_first_page() -> None:
    page = parse_gallery(read_fixture("gallery/treehacks-2024_p1.html"))
    assert page.has_next
    assert len(page.entries) == 24
    # Devpost lists winners first; every entry on page 1 has the winner ribbon.
    assert all(e.is_winner for e in page.entries)

    first = page.entries[0]
    assert first.slug == "baymax-your-personal-healthcare-companion"
    assert first.source_id == "620536"
    assert first.title == "Baymax, Your Personal Healthcare Companion"
    assert first.tagline is not None
    assert first.tagline.startswith("Our AI-powered robot arm")
    assert first.members_preview == (
        Member("aaravwattal", "Aarav Wattal"),
        Member("krishparikh", "Krish Parikh"),
        Member("jamesc27", "James Yu-tang Chen"),
        Member("jaykhem", "Jay Khemchandani"),
    )
    assert first.hidden_members == 0


def test_multi_page_gallery_last_page() -> None:
    page = parse_gallery(read_fixture("gallery/treehacks-2024_p14.html"))
    assert not page.has_next  # "next" exists but is marked unavailable
    assert len(page.entries) == 19
    assert not any(e.is_winner for e in page.entries)

    # A project whose only member deleted their account shows a bare, unlinked avatar.
    palate = next(e for e in page.entries if e.slug == "palate-pals")
    assert palate.members_preview == ()
    assert palate.hidden_members == 1


def test_small_single_page_gallery() -> None:
    page = parse_gallery(read_fixture("gallery/cathacks-xii_p1.html"))
    assert not page.has_next  # no pagination element at all
    assert len(page.entries) == 11
    assert sum(e.is_winner for e in page.entries) == 4
    last = page.entries[-1]
    assert last.slug == "image_debluring"
    assert not last.is_winner
    assert last.members_preview == (Member("Honganh0305", "Hong Anh"),)


def test_every_entry_is_complete() -> None:
    for name in ("treehacks-2024_p1", "treehacks-2024_p14", "cathacks-xii_p1"):
        for e in parse_gallery(read_fixture(f"gallery/{name}.html")).entries:
            assert e.slug
            assert e.source_id.isdigit()
            assert e.title
            assert len(e.members_preview) <= 4


def test_empty_gallery() -> None:
    page = parse_gallery("<html><body><p>No submissions yet.</p></body></html>")
    assert page.entries == ()
    assert not page.has_next


@pytest.mark.parametrize(
    ("item", "message"),
    [
        ('<div class="gallery-item"><a href="https://example.com/">x</a></div>', "without a /software/ link"),
        (
            '<div class="gallery-item"><a class="link-to-software" href="https://devpost.com/software/x"></a>'
            '<footer><div class="members"><span class="user-profile-link" '
            'data-url="https://devpost.com/software/y"></span></div></footer></div>',
            "non-user URL",
        ),
    ],
)
def test_unknown_markup_raises(item: str, message: str) -> None:
    with pytest.raises(ParseError, match=message):
        parse_gallery(item)


def test_avatar_without_alt_falls_back_to_username() -> None:
    item = (
        '<div class="gallery-item" data-software-id="1"><a class="link-to-software" '
        'href="https://devpost.com/software/x"></a><footer><div class="members">'
        '<span class="user-profile-link" data-url="https://devpost.com/jdoe"><img alt=""></span>'
        "</div></footer></div>"
    )
    assert parse_gallery(item).entries[0].members_preview == (Member("jdoe", "jdoe"),)
