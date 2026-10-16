"""Duos (§8.3): pairs with at least 3 events together, scored on placing together and on
beating the finish their ratings predicted."""

from __future__ import annotations

from collections.abc import Hashable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

MIN_EVENTS_TOGETHER = 3


@dataclass(frozen=True, slots=True)
class Duo:
    a: Hashable
    b: Hashable
    events: int
    placements: int
    overperformance: float  # mean (actual - expected) finish percentile
    score: float


def duo_score(events: int, placements: int, overperformance: float) -> float:
    return (placements + 1) / (events + 4) + 0.5 * overperformance * events / (events + 3)


def duos(pairs: Mapping[tuple[Any, Any], Sequence[float]]) -> list[Duo]:
    out = []
    for (a, b), (n, placed, over_sum) in pairs.items():
        if n >= MIN_EVENTS_TOGETHER:
            over = over_sum / n
            out.append(Duo(a, b, int(n), int(placed), over, duo_score(int(n), int(placed), over)))
    return sorted(out, key=lambda d: -d.score)
