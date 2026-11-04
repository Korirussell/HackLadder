"""The live board: everyone ranked from their first event, at exact positions (§15 2026-11-04)."""

from __future__ import annotations

from datetime import date

from hackladder.rate.model import NON_PLACING, Event, Team, replay
from hackladder.rate.run import board_order

TODAY = date(2026, 11, 4)


def field(event: str, ends_on: date, winner: str, others: list[str]) -> Event:
    teams = [Team(f"{event}-w", 1, (winner,))]
    teams += [Team(f"{event}-{p}", NON_PLACING, (p,)) for p in others]
    return Event(event, ends_on, tuple(teams))


def test_everyone_with_one_event_is_on_the_board_in_exact_order() -> None:
    rep = replay([field("a", date(2026, 3, 1), "win", [f"p{i}" for i in range(10)])])
    order = board_order(rep, set(), today=TODAY, inactive_after_months=18)
    assert order[0] == "win"
    assert len(order) == 11  # one event is enough
    assert len(set(order)) == len(order)  # exact positions: nobody shares one


def test_equal_scores_break_by_most_recent_event_then_id() -> None:
    # Two identical one-event careers, one at a later event: the later one ranks higher.
    rep = replay([
        field("old", date(2026, 1, 1), "w1", ["x1", "x2", "x3"]),
        field("new", date(2026, 6, 1), "w2", ["y1", "y2", "y3"]),
    ])  # fmt: skip
    order = board_order(rep, set(), today=TODAY, inactive_after_months=18)
    assert order.index("w2") < order.index("w1")
    assert order.index("y1") < order.index("x1")
    assert order.index("y1") < order.index("y2") < order.index("y3")  # same everything: by id


def test_hidden_and_inactive_people_are_off_the_board() -> None:
    rep = replay([
        field("long-ago", date(2024, 1, 1), "gone", ["g1", "g2"]),
        field("recent", date(2026, 6, 1), "here", ["h1", "secret"]),
    ])  # fmt: skip
    order = board_order(rep, {"secret"}, today=TODAY, inactive_after_months=18)
    assert "secret" not in order
    assert not {"gone", "g1", "g2"} & set(order)  # last event more than 18 months ago
    assert set(order) == {"here", "h1"}
