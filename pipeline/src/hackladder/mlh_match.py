"""Match MLH events to Devpost hackathons by name and dates (§6.6: MLH rarely links to Devpost).

Pure functions: the CLI loads both sides from the database and writes the decisions back.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from difflib import SequenceMatcher
from typing import Literal

from hackladder.parse.common import host_of

Status = Literal["auto", "suggested", "unmatched"]
NameMatch = Literal["exact", "contains", "fuzzy"]

DATE_WINDOW_DAYS = 3  # Devpost's deadline is usually the MLH end date, give or take a day or two
AUTO_SCORE = 0.85
SUGGEST_SCORE = 0.5
AUTO_MARGIN = 0.15  # the best candidate must beat the runner-up by this much to auto-accept
MAX_CANDIDATES = 3  # shown on /admin/mlh so a wrong suggestion is one click to fix

_YEARS = re.compile(r"\b(19|20)\d{2}\b|'\d{2}\b")
_EDITION = re.compile(r"\b(\d+(\.\d+)?|[ivxlc]+|(\d+)(st|nd|rd|th))\b")
_NOISE = re.compile(r"\b(the|hackathon|edition|annual|presents?)\b")
# Words that don't identify an event on their own: "Fall" alone mustn't make "305 Hackathon: Fall
# Edition" contain "STEM Connect Hackathon Fall".
_GENERIC = frozenset({
    "hack", "hacks", "hacker", "hackers", "fall", "spring", "summer", "winter", "day", "week",
    "weekend", "local", "global", "online", "virtual", "january", "february", "march", "april",
    "may", "june", "july", "august", "september", "october", "november", "december",
})  # fmt: skip
_RANK: dict[NameMatch, int] = {"exact": 0, "contains": 1, "fuzzy": 2}


@dataclass(frozen=True, slots=True)
class MlhRow:
    id: int
    name: str
    slug: str
    ends_on: date
    website_url: str | None


@dataclass(frozen=True, slots=True)
class DevpostRow:
    id: int
    title: str
    slug: str  # Devpost subdomain
    ends_on: date | None


@dataclass(frozen=True, slots=True)
class Candidate:
    hackathon_id: int
    slug: str
    title: str
    ends_on: date
    score: float
    days: int  # |Devpost deadline - MLH end|
    name_match: NameMatch


@dataclass(frozen=True, slots=True)
class MatchDecision:
    mlh_event_id: int
    hackathon_id: int | None
    score: float | None
    status: Status
    note: str
    candidates: tuple[Candidate, ...] = ()


def normalize(name: str) -> str:
    """'Cal Hacks 11.0' -> 'cal hacks'; 'HackPrinceton Fall 2024' -> 'hackprinceton fall'."""
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"[^a-z0-9.' ]+", " ", text.replace("-", " ").replace("_", " "))
    text = _NOISE.sub(" ", _EDITION.sub(" ", _YEARS.sub(" ", text)))
    return " ".join(text.replace("'", " ").split())


def _similarity(a: str, b: str) -> float:
    a, b = normalize(a), normalize(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ratio = SequenceMatcher(None, a, b).ratio()
    ta, tb = set(a.split()), set(b.split())
    # "PennApps" vs "PennApps Spring": every token of the shorter name appears in the longer one.
    # Worth less the more extra words the longer name has, so it rarely auto-accepts alone.
    short, long = sorted((len(ta), len(tb)))
    contained = len(ta & tb) / short * (0.75 + 0.25 * short / long)
    return max(ratio, 0.9 * contained)


def name_match(mlh: MlhRow, dev: DevpostRow) -> NameMatch:
    """How the names relate. "contains": every word of the shorter name is in the longer one
    ("MadHacks" / "MadHacks Fall 2023"), and at least one of them identifies the event."""
    if mlh.website_url and host_of(mlh.website_url) == f"{dev.slug}.devpost.com":
        return "exact"
    pairs = [(normalize(mlh.name), normalize(dev.title)), (normalize(mlh.slug), normalize(dev.slug))]
    if any(a and a == b for a, b in pairs):
        return "exact"
    for a, b in pairs:
        short, long = sorted((set(a.split()), set(b.split())), key=len)
        if short and short <= long and short - _GENERIC:
            return "contains"
    return "fuzzy"


def score(mlh: MlhRow, dev: DevpostRow) -> tuple[float, str]:
    if mlh.website_url and host_of(mlh.website_url) == f"{dev.slug}.devpost.com":
        return 1.0, "MLH links to this Devpost page"
    by_name = _similarity(mlh.name, dev.title)
    by_slug = _similarity(mlh.slug, dev.slug)
    return (by_name, "name") if by_name >= by_slug else (by_slug, "slug")


def match_one(mlh: MlhRow, candidates: Sequence[DevpostRow]) -> MatchDecision:
    ranked: list[tuple[Candidate, str]] = []
    for d in candidates:
        if d.ends_on is None or abs((d.ends_on - mlh.ends_on).days) > DATE_WINDOW_DAYS:
            continue
        sc, how = score(mlh, d)
        days = abs((d.ends_on - mlh.ends_on).days)
        c = Candidate(d.id, d.slug, d.title, d.ends_on, round(sc, 3), days, name_match(mlh, d))
        ranked.append((c, how))
    # How the names relate comes before the fuzzy score: "MadHacks" is "MadHacks Fall 2023", not
    # the more similar-looking "MathHacks". Then the closest deadline breaks ties.
    ranked.sort(key=lambda r: (_RANK[r[0].name_match], -r[0].score, r[0].days))
    shown = tuple(c for c, _ in ranked[:MAX_CANDIDATES])
    if not ranked or ranked[0][0].score < SUGGEST_SCORE:
        if ranked:
            note = f"no close name; best was {ranked[0][0].slug} at {ranked[0][0].score:.2f}"
        else:
            note = f"no Devpost event within {DATE_WINDOW_DAYS} days"
        return MatchDecision(mlh.id, None, None, "unmatched", note, shown)
    top, how = ranked[0]
    others = [c for c, _ in ranked[1:]]
    runner_up = max((c.score for c in others), default=0.0)
    note = f"{how} {top.score:.2f}, deadline {top.days} day(s) from MLH end"
    # An exact name no other candidate shares is a clear winner even when a similar name is close
    # behind ("HackSMU V" vs "HackCMU 2023").
    unique_exact = top.name_match == "exact" and all(c.name_match != "exact" for c in others)
    if unique_exact or (top.score >= AUTO_SCORE and top.score - runner_up >= AUTO_MARGIN):
        return MatchDecision(mlh.id, top.hackathon_id, top.score, "auto", note, shown)
    if others:
        note += f"; runner-up {others[0].slug} at {others[0].score:.2f}"
    return MatchDecision(mlh.id, top.hackathon_id, top.score, "suggested", note, shown)


def match_all(mlh_events: Sequence[MlhRow], hackathons: Sequence[DevpostRow]) -> list[MatchDecision]:
    by_week: dict[int, list[DevpostRow]] = {}
    for d in hackathons:
        if d.ends_on is not None:
            by_week.setdefault(d.ends_on.toordinal() // 7, []).append(d)
    decisions = []
    for m in mlh_events:
        week = m.ends_on.toordinal() // 7
        candidates = [d for w in (week - 1, week, week + 1) for d in by_week.get(w, [])]
        decisions.append(match_one(m, candidates))
    return decisions
