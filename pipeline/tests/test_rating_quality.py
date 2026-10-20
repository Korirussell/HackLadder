"""§8.5: the simulation is a regression test for the rating math.

A synthetic world with a hidden truth (hacker skill, series prestige, beginner jams, a planted
duo). If a change to the model drops any of these below its floor, the change is wrong or
needs an explicit, logged decision in §15.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from hackladder.rate.crews import crews
from hackladder.rate.events import EventRow, SeriesRow, analyze, series_key, spearman
from hackladder.rate.model import Replay, display, replay
from hackladder.rate.simulation import DUO, World, simulate


@dataclass(frozen=True)
class Outcome:
    world: World
    rep: Replay
    events: list[EventRow]
    series: list[SeriesRow]


@pytest.fixture(scope="module")
def outcome() -> Outcome:
    world = simulate()
    rep = replay(world.events)
    rows, series, _noise = analyze(rep, {e: series_key(world.url[e], world.series[e]) for e in world.url})
    return Outcome(world, rep, rows, series)


def _rank_corr(xs: list[float], ys: list[float]) -> float:
    rho = spearman(xs, ys)
    assert rho is not None
    return rho


def test_hacker_ratings_track_true_skill(outcome: Outcome) -> None:
    people = [u for u, s in outcome.rep.stats.items() if s.events >= 3]
    scores = [float(display(outcome.rep.ratings[u].mu, outcome.rep.ratings[u].sigma)) for u in people]
    assert _rank_corr([outcome.world.skill[str(u)] for u in people], scores) >= 0.55  # last measured 0.62


def test_event_rating_tracks_true_win_odds(outcome: Outcome) -> None:
    truth = [outcome.world.true_odds[int(str(r.event))] for r in outcome.events]
    assert _rank_corr(truth, [float(r.rating) for r in outcome.events]) >= 0.75  # last measured 0.84


def test_series_rating_tracks_true_prestige(outcome: Outcome) -> None:
    prestige: dict[str, list[float]] = {}
    for r in outcome.events:
        prestige.setdefault(r.series, []).append(outcome.world.prestige[int(str(r.event))])
    multi = [s for s in outcome.series if s.editions >= 2]
    truth = [sum(prestige[s.series]) / len(prestige[s.series]) for s in multi]
    assert _rank_corr(truth, [float(s.rating) for s in multi]) >= 0.80  # last measured 0.88 (0.89 before)


def test_no_beginner_jams_among_the_hardest_events(outcome: Outcome) -> None:
    assert sum(outcome.world.beginner[int(str(r.event))] for r in outcome.events[:20]) == 0


def test_planted_duo_is_found(outcome: Outcome) -> None:
    board = crews(outcome.rep.entries)
    rank = next(i for i, c in enumerate(board, 1) if set(c.members) == set(DUO))
    assert rank <= 10  # last measured #1
