"""Crews (§8.3): groups of two or more people with at least 2 events together, scored on placing
together and on beating the finish their ratings predicted.

A crew is a set of people who were all on the same team at each of its events. A set is kept
only if no bigger set has exactly the same events: if Ann and Bo only ever hacked with Cy, the
crew is the three of them, not also "Ann + Bo".
"""

from __future__ import annotations

import itertools
from collections import defaultdict
from collections.abc import Hashable, Iterable
from dataclasses import dataclass

from hackladder.rate.model import Entry

MIN_EVENTS_TOGETHER = 2
MAX_ENUMERATED = 8  # a bigger team counts only as its whole lineup (2^n subsets otherwise)


@dataclass(frozen=True, slots=True)
class Crew:
    members: tuple[Hashable, ...]
    events: int
    placements: int
    overperformance: float  # mean (actual - expected) finish percentile
    score: float


def crew_score(events: int, placements: int, overperformance: float) -> float:
    return (placements + 1) / (events + 4) + 0.5 * overperformance * events / (events + 3)


def crews(entries: Iterable[Entry]) -> list[Crew]:
    # group -> [events, placements, sum of overperformance]; a person is on one team per event
    stats: dict[tuple[Hashable, ...], list[float]] = defaultdict(lambda: [0, 0, 0.0])
    for e in entries:
        m = e.members
        sizes = range(2, len(m) + 1) if len(m) <= MAX_ENUMERATED else (len(m),)
        for k in sizes:
            for group in itertools.combinations(m, k):
                s = stats[group]
                s[0] += 1
                s[1] += e.placed
                s[2] += e.overperformance
    frequent = {g: s for g, s in stats.items() if s[0] >= MIN_EVENTS_TOGETHER}
    # Supports only shrink as a group grows, so checking supersets one person bigger is enough.
    covered = {
        sub
        for g, s in frequent.items()
        if len(g) > 2
        for sub in itertools.combinations(g, len(g) - 1)
        if frequent.get(sub, (None,))[0] == s[0]
    }
    out = [
        Crew(g, int(n), int(placed), over / n, crew_score(int(n), int(placed), over / n))
        for g, (n, placed, over) in frequent.items()
        if g not in covered
    ]
    return sorted(out, key=lambda c: (-c.score, -len(c.members), [str(m) for m in c.members]))
