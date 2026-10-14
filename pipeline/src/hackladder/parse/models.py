"""Parser outputs. Plain frozen dataclasses: no I/O, no database types."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

MemberKind = Literal["user", "private", "deleted"]


@dataclass(frozen=True, slots=True)
class HackathonMeta:
    source_id: str
    slug: str
    title: str
    url: str
    organization: str | None
    location: str | None
    is_online: bool
    starts_on: date | None
    ends_on: date | None
    registrations: int
    prize_total_usd: int | None  # None when Devpost shows a non-dollar currency
    themes: tuple[str, ...]
    winners_announced: bool
    invite_only: bool
    open_state: str


@dataclass(frozen=True, slots=True)
class HackathonListPage:
    hackathons: tuple[HackathonMeta, ...]
    total_count: int
    per_page: int


@dataclass(frozen=True, slots=True)
class Member:
    """A team member as Devpost shows them.

    Private-mode and deleted accounts have no username and no real name. They still
    occupy a seat on the team, so they are kept, with ``kind`` saying why they're anonymous.
    """

    username: str | None
    display_name: str | None
    kind: MemberKind = "user"

    @property
    def is_anonymous(self) -> bool:
        return self.kind != "user"


@dataclass(frozen=True, slots=True)
class GalleryEntry:
    slug: str
    source_id: str
    title: str
    tagline: str | None
    is_winner: bool
    # A hint only: the gallery shows at most four linked avatars and folds private-mode
    # members into "+ N". The project page is the source of truth for the team.
    members_preview: tuple[Member, ...]
    hidden_members: int


@dataclass(frozen=True, slots=True)
class GalleryPage:
    entries: tuple[GalleryEntry, ...]
    has_next: bool


@dataclass(frozen=True, slots=True)
class Submission:
    """One "Submitted to" block on a project page."""

    hackathon_url: str
    hackathon_title: str
    prizes: tuple[str, ...]  # raw prize names; tiers come from hackladder.prizes


@dataclass(frozen=True, slots=True)
class ProjectPage:
    slug: str
    title: str
    tagline: str | None
    members: tuple[Member, ...]
    submissions: tuple[Submission, ...]
    prizes_at_this_event: tuple[str, ...]
    built_with: tuple[str, ...]
    description_text: str


@dataclass(frozen=True, slots=True)
class UserPage:
    """Public Devpost profile. Devpost shows no structured school field (§16).

    Social and website links are deliberately not parsed: they come only from the
    owner after claiming (§9.3). ``bio`` is kept because claim verification reads it (§11).
    """

    username: str
    display_name: str
    bio: str | None
    location: str | None
