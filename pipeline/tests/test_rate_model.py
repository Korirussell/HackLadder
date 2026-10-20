from __future__ import annotations

from datetime import date

import pytest

from hackladder.rate.crews import crew_score, crews
from hackladder.rate.events import series_key
from hackladder.rate.model import (
    NON_PLACING,
    Entry,
    Event,
    Team,
    dedupe_people,
    display,
    field_scale,
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
    [entry] = rep.entries  # only ann + bo were a team of two or more
    assert (entry.members, entry.placed) == (("ann", "bo"), True)


def _first_place_gain(teams: int) -> int:
    field = [Team(f"t{i}", NON_PLACING, tuple(f"p{i}-{j}" for j in range(4))) for i in range(teams)]
    field[0] = Team("t0", 1, field[0].members)
    rep = replay([Event("e", date(2025, 1, 1), tuple(field))])
    return display(rep.ratings["p0-0"].mu, rep.ratings["p0-0"].sigma) - 1000


def test_winning_a_bigger_field_is_worth_more() -> None:
    # Plain Plackett-Luce did the opposite (+45 at 11 teams, +9 at 300); field_scale fixes it (§15).
    gains = [_first_place_gain(n) for n in (11, 33, 50, 147, 300)]
    assert gains == sorted(gains)
    assert gains[0] < 20 < gains[-1]
    assert field_scale(50) == 1.0


def test_events_with_one_team_are_skipped() -> None:
    rep = replay([Event("solo", date(2025, 1, 1), (Team("t", 1, ("a",)),))])
    assert rep.snapshots == []
    assert rep.ratings == {}


def test_crews_need_two_events_together() -> None:
    entries = [Entry(("a", "b"), True, 0.3), Entry(("a", "b"), False, 0.1), Entry(("a", "c"), True, 1.0)]
    [only] = crews(entries)
    assert (only.members, only.events, only.placements) == (("a", "b"), 2, 1)
    assert only.score == pytest.approx(crew_score(2, 1, 0.2))


def test_a_crew_is_the_biggest_group_with_those_events() -> None:
    abc = Entry(("a", "b", "c"), True, 0.5)
    # a, b and c twice together: one crew of three, not also a+b, a+c and b+c
    assert [c.members for c in crews([abc, abc])] == [("a", "b", "c")]
    # a and b also hacked once without c: they're a crew of their own too, with three events
    board = {c.members: c.events for c in crews([abc, abc, Entry(("a", "b", "d"), False, -0.2)])}
    assert board == {("a", "b", "c"): 2, ("a", "b"): 3}


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
