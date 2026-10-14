"""Project page: ``https://devpost.com/software/<slug>``."""

from __future__ import annotations

from bs4 import BeautifulSoup, Tag

from hackladder.parse.common import (
    ParseError,
    anonymous_member_kind,
    host_of,
    prize_tier,
    text_of,
    username_from_url,
)
from hackladder.parse.models import Member, Prize, ProjectPage, Submission


def _member(li: Tag) -> Member:
    if kind := anonymous_member_kind(li):
        return Member(username=None, display_name=None, kind=kind)
    # Two profile links per member: the first wraps only the avatar, the second holds the name.
    links = li.select("a.user-profile-link[href]")
    username = next((u for a in links if (u := username_from_url(str(a["href"])))), None)
    if username is None:
        raise ParseError(f"team member without a profile link or anonymity marker: {text_of(li)!r}")
    name = next((t for a in links if (t := text_of(a))), username)
    return Member(username=username, display_name=name)


def _submission(li: Tag) -> Submission:
    link = li.select_one(".software-list-content a[href]")
    if link is None:
        raise ParseError(f"'Submitted to' entry without an event link: {text_of(li)!r}")
    prizes: list[Prize] = []
    for item in li.select(".software-list-content li:has(span.winner)"):
        for badge in item.select("span.winner"):
            badge.decompose()
        name = text_of(item) or ""
        prizes.append(Prize(name=name, tier=prize_tier(name)))
    return Submission(
        hackathon_url=str(link["href"]),
        hackathon_title=text_of(link) or "",
        prizes=tuple(prizes),
    )


def parse_project(html: str, hackathon_host: str) -> ProjectPage:
    """Parse a project page. ``hackathon_host`` (e.g. ``treehacks-2024.devpost.com``) selects
    which "Submitted to" block the prizes come from: a project lists every event it entered."""
    soup = BeautifulSoup(html, "html.parser")
    title = text_of(soup.select_one("#app-title"))
    if title is None:
        raise ParseError("not a project page: no #app-title")

    og_url = soup.select_one("meta[property='og:url']")
    slug = str(og_url["content"]).rstrip("/").rsplit("/software/", 1)[-1] if og_url else ""

    submissions = tuple(
        _submission(li) for li in soup.select("#submissions ul.software-list-with-thumbnail > li")
    )
    host = host_of(hackathon_host)
    here = next((s for s in submissions if host_of(s.hackathon_url) == host), None)

    description = (d.get_text("\n", strip=True) for d in soup.select("#app-details-left > div:not([id])"))
    return ProjectPage(
        slug=slug,
        title=title,
        tagline=text_of(soup.select_one("#software-header p.large")),
        members=tuple(_member(li) for li in soup.select("#app-team li.software-team-member")),
        submissions=submissions,
        prizes_at_this_event=here.prizes if here else (),
        built_with=tuple(t for el in soup.select("#built-with .cp-tag") if (t := text_of(el))),
        description_text="\n\n".join(b for b in description if b),
    )
