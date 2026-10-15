"""Hacker ratings: replay every event in date order through OpenSkill Plackett-Luce (§8.1).

Ported from prototype/rate.py; the math is unchanged (§8: rerun the simulation before
touching it). Pure functions over plain data, so the simulation test and the database run
share exactly the same code.
"""

from __future__ import annotations

import itertools
from collections import defaultdict
from collections.abc import Hashable, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from openskill.models import PlackettLuce

NON_PLACING = 5  # submitted but didn't place (tier 5 "prizes" land here too)
TOP_FIELD_N = 10
NO_PRIZE_NAME_RANK = 2  # a winner badge with no prize name counts like a main track win (§8.1)

PersonId = Hashable


@dataclass(frozen=True, slots=True)
class Team:
    key: str  # stable identifier, e.g. the project's source id
    rank: int  # 1 best ... NON_PLACING
    members: tuple[PersonId, ...]
    anonymous: int = 0  # private/deleted seats: rated as fresh, average players, then discarded


@dataclass(frozen=True, slots=True)
class Event:
    id: Hashable
    ends_on: date
    teams: tuple[Team, ...]


@dataclass
class PersonStats:
    events: int = 0
    placements: int = 0
    grand_prizes: int = 0
    last_event_on: date | None = None


@dataclass(frozen=True, slots=True)
class HistoryRow:
    person: PersonId
    event: Hashable
    ends_on: date
    score_before: int
    score_after: int


@dataclass(frozen=True, slots=True)
class Snapshot:
    """An event as rated: its (deduplicated) teams and each team's pre-event mean mu."""

    event: Hashable
    teams: tuple[Team, ...]
    pre_team_mu: tuple[float, ...]


@dataclass
class Replay:
    ratings: dict[PersonId, Any] = field(default_factory=dict)  # openskill rating objects
    stats: dict[PersonId, PersonStats] = field(default_factory=lambda: defaultdict(PersonStats))
    history: list[HistoryRow] = field(default_factory=list)
    snapshots: list[Snapshot] = field(default_factory=list)
    # (a, b) with a < b -> [events together, placements together, sum of actual-minus-expected]
    pairs: dict[tuple[PersonId, PersonId], list[float]] = field(
        default_factory=lambda: defaultdict(lambda: [0, 0, 0.0])
    )


def display(mu: float, sigma: float) -> int:
    """The public score: conservative skill on a familiar scale, new hacker ~ 1000 (§8.1)."""
    return round(1000 + 40 * (mu - 3 * sigma))


def team_rank(prize_tiers: Iterable[int], is_winner: bool) -> int:
    """A project's finish from its prize tiers at this event (§6.5, §8.1)."""
    tiers = list(prize_tiers)
    placing = [t for t in tiers if t < NON_PLACING]
    if placing:
        return min(placing)
    if is_winner and not tiers:
        return NO_PRIZE_NAME_RANK
    return NON_PLACING


def dedupe_people(teams: Sequence[Team]) -> list[Team]:
    """A person on two projects at one event keeps only their best-placed one."""
    seen: set[PersonId] = set()
    out = []
    for t in sorted(teams, key=lambda t: t.rank):
        keep = tuple(m for m in t.members if m not in seen)
        seen.update(keep)
        # A team whose named members all placed better elsewhere drops out; a team that
        # never had named members (only private/deleted seats) still competes.
        if keep or (not t.members and t.anonymous):
            out.append(Team(t.key, t.rank, keep, t.anonymous))
    return out


def percentiles(ranks: Sequence[float]) -> list[float]:
    """Finish percentile in [0, 1] (1 = best); ties share their average position."""
    n = len(ranks)
    if n < 2:
        return [0.5] * n
    order = sorted(range(n), key=lambda i: ranks[i])
    pos = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and ranks[order[j + 1]] == ranks[order[i]]:
            j += 1
        for k in range(i, j + 1):
            pos[order[k]] = (i + j) / 2
        i = j + 1
    return [1 - p / (n - 1) for p in pos]


def replay(events: Iterable[Event]) -> Replay:
    model = PlackettLuce()
    out = Replay()
    ratings = out.ratings
    for ev in sorted(events, key=lambda e: (e.ends_on, str(e.id))):
        teams = dedupe_people(ev.teams)
        if len(teams) < 2:
            continue
        for t in teams:
            for m in t.members:
                if m not in ratings:
                    ratings[m] = model.rating(name=str(m))

        lineups = [
            [ratings[m] for m in t.members] + [model.rating() for _ in range(t.anonymous)] for t in teams
        ]
        pre_team_mu = tuple(sum(r.mu for r in lineup) / len(lineup) for lineup in lineups)
        out.snapshots.append(Snapshot(ev.id, tuple(teams), pre_team_mu))
        before = {m: display(ratings[m].mu, ratings[m].sigma) for t in teams for m in t.members}

        ranks = [float(t.rank) for t in teams]  # openskill only uses their order
        actual = percentiles(ranks)
        expected = percentiles([-mu for mu in pre_team_mu])
        new = model.rate(lineups, ranks=ranks)

        for t, team_new, a, e in zip(teams, new, actual, expected, strict=True):
            for m, r in zip(t.members, team_new, strict=False):  # trailing anonymous seats discarded
                ratings[m] = r
                s = out.stats[m]
                s.events += 1
                s.last_event_on = ev.ends_on
                s.placements += t.rank < NON_PLACING
                s.grand_prizes += t.rank == 1
                out.history.append(HistoryRow(m, ev.id, ev.ends_on, before[m], display(r.mu, r.sigma)))
            for pa, pb in itertools.combinations(sorted(t.members, key=str), 2):
                p = out.pairs[(pa, pb)]
                p[0] += 1
                p[1] += t.rank < NON_PLACING
                p[2] += a - e
    return out
