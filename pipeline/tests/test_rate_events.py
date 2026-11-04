"""Event win odds (§8.2)."""

from __future__ import annotations

from datetime import date, timedelta

from openskill.models import PlackettLuce

from hackladder.rate.events import analyze
from hackladder.rate.model import NON_PLACING, Event, Team, replay


def test_win_odds_use_the_models_noise_not_a_hindsight_fit() -> None:
    # Every entrant is a one-event first-timer, so their final rating is just that event's result.
    # A noise fitted on final ratings then "predicts" every winner and collapses toward zero, which
    # put real events at 1 in 3 billion (§15 2026-11-02). The odds must stay plausible.
    events = [
        Event(
            f"e{i}",
            date(2025, 1, 1) + timedelta(days=i),
            tuple(Team(f"t{i}-{j}", 1 if j == 0 else NON_PLACING, (f"p{i}-{j}",)) for j in range(12)),
        )
        for i in range(40)
    ]
    rows, _series, noise = analyze(replay(events), {f"e{i}": "s" for i in range(40)})
    assert noise == PlackettLuce().beta
    assert max(r.win_odds for r in rows) < 1000
