from __future__ import annotations

from datetime import date

import pytest

from hackladder.rate.duos import duo_score, duos
from hackladder.rate.events import series_key
from hackladder.rate.model import (
    NON_PLACING,
    Event,
    Team,
    dedupe_people,
    display,
    percentiles,
    replay,
    team_rank,
)


@pytest.mark.parametrize(
    ("tiers", "is_winner", "rank"),
    [
        ([1, 4], True, 1),
        ([3, 4], True, 3),
        ([], True, 2),  # winner badge, no prize name
        ([5], True, NON_PLACING),  # only a raffle
        ([], False, NON_PLACING),
    ],
)
def test_team_rank(tiers: list[int], is_winner: bool, rank: int) -> None:
    assert team_rank(tiers, is_winner) == rank


def test_dedupe_keeps_each_persons_best_finish() -> None:
    teams = [Team("loser", 5, ("a", "b")), Team("winner", 1, ("a",)), Team("ghost", 5, (), anonymous=1)]
    out = {t.key: t.members for t in dedupe_people(teams)}
    assert out == {"winner": ("a",), "loser": ("b",), "ghost": ()}
    assert [t.key for t in dedupe_people([Team("w", 1, ("a",)), Team("dup", 5, ("a",))])] == ["w"]


def test_percentiles_share_ties() -> None:
    assert percentiles([1, 2, 2, 3]) == [1.0, 0.5, 0.5, 0.0]


def test_display_starts_new_hackers_near_1000() -> None:
    assert display(25.0, 25 / 3) == 1000


def test_replay_rewards_winners_and_records_history() -> None:
    d = date(2025, 1, 1)
    events = [
        Event(
            "e1",
            d,
            (Team("t1", 1, ("ann", "bo")), Team("t2", 5, ("cy",)), Team("t3", 5, ("di",), anonymous=1)),
        ),
        Event(
            "e0", date(2024, 1, 1), (Team("x", 1, ("cy",)), Team("y", 5, ("ann",)))
        ),  # earlier: replayed first
    ]
    rep = replay(events)
    assert [s.event for s in rep.snapshots] == ["e0", "e1"]
    assert rep.stats["ann"].events == 2
    assert rep.stats["ann"].placements == 1
    assert rep.stats["cy"].grand_prizes == 1
    assert rep.ratings["bo"].mu > rep.ratings["di"].mu
    assert "anonymous" not in rep.ratings  # anonymous seats are never stored
    assert len(rep.snapshots[1].teams[2].members) == 1
    ann_e1 = next(h for h in rep.history if h.person == "ann" and h.event == "e1")
    assert ann_e1.score_after > ann_e1.score_before
    assert rep.pairs[("ann", "bo")] == [1, 1, pytest.approx(rep.pairs[("ann", "bo")][2])]


def test_events_with_one_team_are_skipped() -> None:
    rep = replay([Event("solo", date(2025, 1, 1), (Team("t", 1, ("a",)),))])
    assert rep.snapshots == []
    assert rep.ratings == {}


def test_duos_need_three_events() -> None:
    pairs = {("a", "b"): [3, 2, 0.6], ("a", "c"): [2, 2, 1.0]}
    [only] = duos(pairs)
    assert (only.a, only.b, only.events, only.placements) == ("a", "b", 3, 2)
    assert only.score == pytest.approx(duo_score(3, 2, 0.2))


@pytest.mark.parametrize(
    ("url", "title", "key"),
    [
        ("https://treehacks-2024.devpost.com/", "TreeHacks 2024", "treehacks"),
        ("https://hackx-3.devpost.com/", "HackX 3", "hackx"),
        ("https://hackprinceton-fall.devpost.com/", "HackPrinceton", "hackprinceton"),
        ("https://cal-hacks-11.devpost.com/", "Cal Hacks 11.0", "cal-hacks"),
        ("https://devpost.com/x", "Some Jam 2023", "some jam"),
    ],
)
def test_series_key(url: str, title: str, key: str) -> None:
    assert series_key(url, title) == key
