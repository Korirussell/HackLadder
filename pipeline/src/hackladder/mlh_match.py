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

DATE_WINDOW_DAYS = 3  # Devpost's deadline is usually the MLH end date, give or take a day or two
AUTO_SCORE = 0.85
SUGGEST_SCORE = 0.5
AUTO_MARGIN = 0.15  # the best candidate must beat the runner-up by this much to auto-accept

_YEARS = re.compile(r"\b(19|20)\d{2}\b|'\d{2}\b")
_EDITION = re.compile(r"\b(\d+(\.\d+)?|[ivxlc]+|(\d+)(st|nd|rd|th))\b")
_NOISE = re.compile(r"\b(the|hackathon|edition|annual|presents?)\b")


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
class MatchDecision:
    mlh_event_id: int
    hackathon_id: int | None
    score: float | None
    status: Status
    note: str


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


def score(mlh: MlhRow, dev: DevpostRow) -> tuple[float, str]:
    if mlh.website_url and host_of(mlh.website_url) == f"{dev.slug}.devpost.com":
        return 1.0, "MLH links to this Devpost page"
    by_name = _similarity(mlh.name, dev.title)
    by_slug = _similarity(mlh.slug, dev.slug)
    return (by_name, "name") if by_name >= by_slug else (by_slug, "slug")


def match_one(mlh: MlhRow, candidates: Sequence[DevpostRow]) -> MatchDecision:
    nearby = [
        d
        for d in candidates
        if d.ends_on is not None and abs((d.ends_on - mlh.ends_on).days) <= DATE_WINDOW_DAYS
    ]
    scored = sorted(((*score(mlh, d), d) for d in nearby), key=lambda s: s[0], reverse=True)
    if not scored or scored[0][0] < SUGGEST_SCORE:
        if scored:
            note = f"no close name; best was {scored[0][2].slug} at {scored[0][0]:.2f}"
        else:
            note = f"no Devpost event within {DATE_WINDOW_DAYS} days"
        return MatchDecision(mlh.id, None, None, "unmatched", note)
    top_score, how, top = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    days = abs((top.ends_on or mlh.ends_on) - mlh.ends_on).days
    note = f"{how} {top_score:.2f}, deadline {days} day(s) from MLH end"
    if top_score >= AUTO_SCORE and top_score - runner_up >= AUTO_MARGIN:
        return MatchDecision(mlh.id, top.id, round(top_score, 3), "auto", note)
    if len(scored) > 1:
        note += f"; runner-up {scored[1][2].slug} at {runner_up:.2f}"
    return MatchDecision(mlh.id, top.id, round(top_score, 3), "suggested", note)


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
