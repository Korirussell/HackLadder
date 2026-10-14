"""``hl check <event-url>``: crawl and parse one hackathon end to end, and report anomalies.

This is the "does the parser still match Devpost?" smoke test. It writes nothing to
the database; pages land in the local raw cache so a re-run makes zero requests.
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import quote

from hackladder.crawl.http import FetchFailedError, FetchResult
from hackladder.parse import (
    GalleryEntry,
    HackathonMeta,
    ParseError,
    ProjectPage,
    parse_gallery,
    parse_hackathon_list,
    parse_project,
)
from hackladder.parse.common import host_of

log = logging.getLogger(__name__)

LIST_API = "https://devpost.com/api/hackathons"


class Fetcher(Protocol):
    def get(self, url: str) -> FetchResult: ...


@dataclass(slots=True)
class CheckedProject:
    entry: GalleryEntry
    page: ProjectPage | None
    error: str | None = None


@dataclass(slots=True)
class CheckReport:
    event_url: str
    meta: HackathonMeta | None = None
    gallery_pages: int = 0
    projects: list[CheckedProject] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def parsed(self) -> list[tuple[GalleryEntry, ProjectPage]]:
        return [(p.entry, p.page) for p in self.projects if p.page is not None]

    def tier_counts(self) -> Counter[int]:
        return Counter(pr.tier for _, page in self.parsed for pr in page.prizes_at_this_event)

    def team_sizes(self) -> Counter[int]:
        return Counter(len(page.members) for _, page in self.parsed)

    def hackers(self) -> set[str]:
        return {m.username for _, page in self.parsed for m in page.members if m.username}


def normalize_event_url(url: str) -> str:
    host = host_of(url)
    if not host.endswith(".devpost.com") or host in {"www.devpost.com", "secure.devpost.com"}:
        raise ValueError(f"expected a hackathon URL like https://<event>.devpost.com/, got {url!r}")
    return f"https://{host}/"


def find_meta(fetch: Fetcher, event_url: str) -> HackathonMeta | None:
    """Look the event up in the list API by its subdomain."""
    slug = host_of(event_url).split(".")[0]
    result = fetch.get(f"{LIST_API}?search={quote(slug)}&status[]=ended")
    if result.status != 200:
        return None
    page = parse_hackathon_list(result.text)
    return next((h for h in page.hackathons if host_of(h.url) == host_of(event_url)), None)


def _compare(entry: GalleryEntry, page: ProjectPage, warnings: list[str]) -> None:
    if not page.members:
        warnings.append(f"{entry.slug}: project page lists no team members")
    if entry.is_winner != bool(page.prizes_at_this_event):
        warnings.append(
            f"{entry.slug}: gallery winner={entry.is_winner} but project page has "
            f"{len(page.prizes_at_this_event)} prize(s) for this event"
        )
    team = {m.username for m in page.members}
    missing = [m.username for m in entry.members_preview if m.username not in team]
    if missing:
        warnings.append(f"{entry.slug}: gallery shows {missing} but the project page doesn't")
    shown = len(entry.members_preview) + entry.hidden_members
    if shown != len(page.members):
        warnings.append(
            f"{entry.slug}: gallery implies {shown} members, project page lists {len(page.members)}"
        )
    if page.slug and page.slug != entry.slug:
        warnings.append(f"{entry.slug}: project page canonical slug is {page.slug!r}")


def _check_project(fetch: Fetcher, entry: GalleryEntry, host: str) -> CheckedProject:
    try:
        result = fetch.get(f"https://devpost.com/software/{entry.slug}")
    except FetchFailedError as exc:
        return CheckedProject(entry=entry, page=None, error=str(exc))
    if result.status != 200:
        return CheckedProject(entry=entry, page=None, error=f"HTTP {result.status}")
    try:
        return CheckedProject(entry=entry, page=parse_project(result.text, host))
    except ParseError as exc:
        return CheckedProject(entry=entry, page=None, error=f"parse error: {exc}")


def run_check(
    fetch: Fetcher,
    event_url: str,
    *,
    limit: int | None = None,
    on_project: Callable[[CheckedProject], None] | None = None,
) -> CheckReport:
    base = normalize_event_url(event_url)
    report = CheckReport(event_url=base)
    report.meta = find_meta(fetch, base)
    if report.meta is None:
        report.warnings.append("event not found in the list API search; continuing with the gallery only")

    host = host_of(base)
    entries: list[GalleryEntry] = []
    page_no = 1
    while limit is None or len(entries) < limit:
        result = fetch.get(f"{base}project-gallery?page={page_no}")
        if result.status != 200:
            report.warnings.append(f"gallery page {page_no}: HTTP {result.status}")
            break
        gallery = parse_gallery(result.text)
        report.gallery_pages += 1
        entries.extend(gallery.entries)
        if not gallery.entries or not gallery.has_next:
            break
        page_no += 1
    entries = entries[:limit] if limit is not None else entries

    seen: set[str] = set()
    for entry in entries:
        if entry.slug in seen:
            report.warnings.append(f"{entry.slug}: listed twice in the gallery")
            continue
        seen.add(entry.slug)
        checked = _check_project(fetch, entry, host)
        if checked.page is not None:
            _compare(entry, checked.page, report.warnings)
        else:
            report.warnings.append(f"{entry.slug}: {checked.error}")
        report.projects.append(checked)
        if on_project:
            on_project(checked)
    return report
