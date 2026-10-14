"""Hackathon project gallery: ``https://<event>.devpost.com/project-gallery?page=N``."""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from hackladder.parse.common import ParseError, text_of, username_from_url
from hackladder.parse.models import GalleryEntry, GalleryPage, Member


def _preview_member(span: Tag) -> Member:
    username = username_from_url(str(span["data-url"]))
    if username is None:
        raise ParseError(f"gallery avatar links to a non-user URL: {span['data-url']!r}")
    img = span.select_one("img")
    name = str(img.get("alt") or "").strip() if img else ""
    return Member(username=username, display_name=name or username)


def _entry(item: Tag) -> GalleryEntry:
    link = item.select_one("a.link-to-software[href*='/software/']")
    if link is None:
        raise ParseError("gallery item without a /software/ link")
    slug = str(link["href"]).rstrip("/").split("/software/")[-1]
    footer = item.select_one("footer .members")
    # Not shown by name: the "+ N" overflow (which also absorbs private-mode members)
    # and bare avatars without a profile link (deleted accounts).
    overflow = re.search(r"\+\s*(\d+)", text_of(footer) or "")
    hidden = (int(overflow.group(1)) if overflow else 0) + len(item.select("footer .members > img"))
    return GalleryEntry(
        slug=slug,
        source_id=str(item.get("data-software-id") or ""),
        title=text_of(item.select_one(".software-entry-name h5")) or slug,
        tagline=text_of(item.select_one(".software-entry-name .tagline")),
        # The winner ribbon is the only reliable flag (§6.6).
        is_winner=item.select_one("aside.entry-badge img.winner") is not None,
        members_preview=tuple(
            _preview_member(s) for s in item.select("footer .members span.user-profile-link[data-url]")
        ),
        hidden_members=hidden,
    )


def parse_gallery(html: str) -> GalleryPage:
    soup = BeautifulSoup(html, "html.parser")
    entries = tuple(_entry(item) for item in soup.select("div.gallery-item"))
    next_link = soup.select_one("ul.pagination li.next_page:not(.unavailable) a[rel='next']")
    return GalleryPage(entries=entries, has_next=next_link is not None)
