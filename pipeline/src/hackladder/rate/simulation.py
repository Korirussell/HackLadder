"""Synthetic hackathon world with a hidden truth, for the §8.5 rating-quality regression test.

Ported from prototype/simulate.py. It draws from the random stream in exactly the prototype's
order, so the same seed reproduces the same world: hackers with a true skill, 45 recurring
series with a hidden prestige, big beginner-only online jams, and one planted "magic duo"
that performs better together than apart. All names are invented.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, timedelta

from hackladder.rate.model import Event, Team, team_rank

N_HACKERS, N_EVENTS = 2500, 220
DUO = ("h11", "h12")
SYNERGY = 1.2
TIERS = [1, 2, 2, 3, 3, 3, 3, 4, 4, 4]  # prize tiers for the top 10 teams of every event
_SYLLABLES = [
    "tree",
    "byte",
    "cal",
    "pen",
    "hack",
    "mit",
    "quack",
    "storm",
    "bit",
    "uni",
    "nova",
    "red",
    "blue",
    "code",
]
BEGINNER_SERIES = "online_beginner_jam"


@dataclass(frozen=True)
class World:
    events: list[Event]
    skill: dict[str, float]
    prestige: dict[int, float]  # per event
    true_odds: dict[int, float]  # 1-in-N for a 90th-percentile team, by Monte Carlo
    beginner: dict[int, bool]
    series: dict[int, str]  # event -> series name
    url: dict[int, str]


def simulate(seed: int = 7) -> World:  # noqa: PLR0915 - a faithful port; splitting risks reordering draws
    rng = random.Random(seed)
    skill = {f"h{i}": rng.gauss(0, 1) for i in range(N_HACKERS)}
    activity = {u: rng.random() ** 2 for u in skill}  # some people hack a lot, most rarely
    skill[DUO[0]] = skill[DUO[1]] = 0.3  # ordinary on paper, strong together

    series_list: list[tuple[str, float]] = []
    while len(series_list) < 45:
        n = rng.choice(_SYLLABLES) + rng.choice(_SYLLABLES) + rng.choice(["hacks", "hacks", "athon", "_hack"])
        if n not in [x for x, _ in series_list]:
            series_list.append((n, rng.random()))
    ref_skill = sorted(skill.values())[int(0.9 * N_HACKERS)]

    events: list[Event] = []
    prestige_of: dict[int, float] = {}
    odds_of: dict[int, float] = {}
    beginner_of: dict[int, bool] = {}
    series_of: dict[int, str] = {}
    url_of: dict[int, str] = {}
    d = date(2023, 1, 1)
    for e in range(N_EVENTS):
        d += timedelta(days=rng.randint(2, 6))
        series, base = rng.choice(series_list)
        prestige = min(1, max(0, base + rng.gauss(0, 0.08)))  # big-name events draw stronger hackers
        beginner = rng.random() < 0.2  # big online beginner-friendly events
        if beginner:
            series, prestige = BEGINNER_SERIES, 0.0
            size = rng.randint(250, 450)
            pool = sorted(
                skill,
                key=lambda u: -(activity[u] * rng.random() - 0.8 * (skill[u] > 0.5) * rng.random()),
            )[:size]
        else:
            size = int(40 + 400 * prestige * rng.random())

            def draw(u: str, p: float = prestige) -> float:
                return -(activity[u] * rng.random() + 0.6 * p * (skill[u] > 1) * rng.random())

            pool = sorted(skill, key=draw)[:size]
        rng.shuffle(pool)
        if e % 3 == 0 and DUO[0] not in pool:
            pool[:2] = list(DUO)
        teams: list[list[str]] = []
        i = 0
        while i < len(pool):
            k = rng.choice([1, 2, 3, 3, 4, 4])
            t = pool[i : i + k]
            if DUO[0] in t and DUO[1] not in t:
                t = [u for u in t if u != DUO[0]]  # keep the duo intact
            if DUO[1] in t and DUO[0] not in t:
                t = [u for u in t if u != DUO[1]]
            i += k
            if t:
                teams.append(t)
        if DUO[0] in pool and not any(DUO[0] in t for t in teams):
            teams.append(list(DUO))

        def bonus(t: list[str]) -> float:
            return SYNERGY if DUO[0] in t and DUO[1] in t else 0.0

        base_perf = [sum(skill[u] for u in t) / len(t) + 0.15 * len(t) + bonus(t) for t in teams]
        ref = ref_skill + 0.15 * 3
        wins = sum(
            ref + rng.gauss(0, 0.7) > max(b + rng.gauss(0, 0.7) for b in base_perf) for _ in range(400)
        )
        teams.sort(
            key=lambda t: sum(skill[u] for u in t) / len(t) + 0.15 * len(t) + rng.gauss(0, 0.7) + bonus(t),
            reverse=True,
        )
        # The prototype loaded projects ordered by slug ("p{e}-{rank}" as text); keep that order.
        entries = sorted(
            (
                Team(
                    key=f"p{e}-{rank}",
                    rank=team_rank([TIERS[rank]] if rank < len(TIERS) else [], rank < len(TIERS)),
                    members=tuple(t),
                )
                for rank, t in enumerate(teams)
            ),
            key=lambda team: team.key,
        )
        events.append(Event(id=e, ends_on=d, teams=tuple(entries)))
        prestige_of[e], odds_of[e], beginner_of[e], series_of[e] = (
            prestige,
            400 / max(wins, 0.5),
            beginner,
            series,
        )
        url_of[e] = f"https://{series.replace('_', '-')}-{d.year}-{e}.devpost.com/"
    return World(events, skill, prestige_of, odds_of, beginner_of, series_of, url_of)
