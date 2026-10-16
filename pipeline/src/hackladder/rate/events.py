"""Event and series ranking (§8.2), ported from prototype/analyze_events.py; math unchanged.

Each entrant is judged by their final (hindsight) conservative rating mu - 1 sigma, so
first-timers count as unproven. win_odds is the exact 1-in-N chance that a team at the
global 90th percentile takes 1st against that field, with per-event noise calibrated on who
actually won. Event rating = 70% z(log1p(elite)) + 30% z(log(win_odds)).
"""

from __future__ import annotations

import math
import random
import re
import statistics as st
from collections import defaultdict
from collections.abc import Hashable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
from openskill.models import PlackettLuce
from scipy.stats import norm

from hackladder.rate.model import Replay

WEIGHTS = {"win_odds": 0.30, "elite": 0.70}  # elite-heavy: resists isolated pools (§8.2)
REF_PCTL = 0.90
UNPROVEN_K = 1.0
MIN_TEAMS = 8
MIN_EVENTS_FOR_ELITE = 3
CALIBRATION_SAMPLE = 400


@dataclass(frozen=True, slots=True)
class EventRow:
    event: Hashable
    series: str
    teams: int
    hackers: int
    win_odds: float
    top_field: float  # mean final mu of the 10 strongest entrants
    field_mean: float  # mean final mu of everyone
    elite: int
    judging: float | None
    z: float
    rating: int


@dataclass(frozen=True, slots=True)
class SeriesRow:
    series: str
    editions: int
    rating: int
    best_event: Hashable


def series_key(url: str, title: str) -> str:
    """treehacks-2024 -> treehacks; hackx-3 / hackx-2.0 -> hackx (§7.3)."""
    sub = re.sub(r"^https?://", "", url).split(".")[0].lower()
    if sub in ("devpost", "www", ""):
        sub = title.lower()
    sub = re.sub(r"[-_ ]?(19|20)\d{2}.*$", "", sub)
    sub = re.sub(r"[-_ ]?(fall|spring|winter|summer|s\d\d|f\d\d)$", "", sub)
    sub = re.sub(r"[-_ ]?v?\d+(\.\d+)?$", "", sub)
    return sub.replace("_", "-").strip("- ") or sub


def spearman(x: Sequence[float], y: Sequence[float]) -> float | None:
    """Rank correlation with tied ranks averaged."""
    if len(x) < 3:
        return None

    def rk(v: Sequence[float]) -> list[float]:
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r

    a, b = rk(x), rk(y)
    ma, mb = st.mean(a), st.mean(b)
    num = sum((p - ma) * (q - mb) for p, q in zip(a, b, strict=True))
    den = math.sqrt(sum((p - ma) ** 2 for p in a) * sum((q - mb) ** 2 for q in b))
    return num / den if den else None


def p_ref_wins(ref_strength: float, ref_sd: float, strengths: Sequence[float], sds: Sequence[float]) -> float:
    """Exact P(the reference team beats every other team), each team's performance ~ Normal."""
    x = np.linspace(ref_strength - 6 * ref_sd, ref_strength + 6 * ref_sd, 2001)
    dens = norm.pdf(x, ref_strength, ref_sd)
    log_beat_all = np.zeros_like(x)
    for m, sd in zip(strengths, sds, strict=True):
        log_beat_all += norm.logcdf((x - m) / sd)
    return float(np.trapezoid(dens * np.exp(log_beat_all), x))


def p_team_first(j: int, strengths: Sequence[float], sd: float, grid: int = 801) -> float:
    m = strengths[j]
    x = np.linspace(m - 6 * sd, m + 6 * sd, grid)
    others = np.delete(np.asarray(strengths), j)
    logc = norm.logcdf((x[:, None] - others[None, :]) / sd).sum(axis=1)
    return float(np.trapezoid(norm.pdf(x, m, sd) * np.exp(logc), x))


def calibrate_noise(fields: Sequence[tuple[list[float], int]]) -> float:
    """The per-event performance noise that best predicts who actually took 1st."""
    best_sd, best_ll = 1.0, -math.inf
    for sd in np.geomspace(1, 40, 25):
        ll = sum(math.log(max(p_team_first(j, f, float(sd)), 1e-12)) for f, j in fields)
        if ll > best_ll:
            best_sd, best_ll = float(sd), ll
    return best_sd


def zscores(vals: Sequence[float]) -> list[float]:
    m, s = st.mean(vals), st.pstdev(vals) or 1
    return [(v - m) / s for v in vals]


def analyze(rep: Replay, series_of: Mapping[Any, str]) -> tuple[list[EventRow], list[SeriesRow], float]:
    """Rank events and series. Returns (events by rating, series by rating, calibrated noise)."""
    final = {u: r.mu for u, r in rep.ratings.items()}
    events_of: dict[Hashable, int] = defaultdict(int)
    for snap in rep.snapshots:
        for t in snap.teams:
            for u in t.members:
                events_of[u] += 1
    seasoned = sorted(
        (r.mu - 3 * r.sigma for u, r in rep.ratings.items() if events_of[u] >= MIN_EVENTS_FOR_ELITE),
        reverse=True,
    )
    elite_cut = seasoned[max(0, len(seasoned) // 20 - 1)] if seasoned else math.inf
    effs = sorted(
        r.mu - UNPROVEN_K * r.sigma for u, r in rep.ratings.items() if events_of[u] >= MIN_EVENTS_FOR_ELITE
    ) or [25.0]
    ref_mu = effs[int(REF_PCTL * (len(effs) - 1))]
    default = PlackettLuce().rating()
    unknown = default.mu - UNPROVEN_K * default.sigma  # an anonymous seat: unproven
    eff = {u: r.mu - UNPROVEN_K * r.sigma for u, r in rep.ratings.items()}

    def team_strength(members: Sequence[Hashable], anonymous: int) -> float:
        return float(st.mean([*(eff[u] for u in members), *([unknown] * anonymous)]))

    fields = []
    for snap in rep.snapshots:
        if len(snap.teams) < MIN_TEAMS:
            continue
        strengths = [team_strength(t.members, t.anonymous) for t in snap.teams]
        firsts = [i for i, t in enumerate(snap.teams) if t.rank == 1]
        if len(firsts) == 1:
            fields.append((strengths, firsts[0]))
    if len(fields) > CALIBRATION_SAMPLE:  # plenty to fit one number; keeps the runtime short
        fields = random.Random(0).sample(fields, CALIBRATION_SAMPLE)
    noise = calibrate_noise(fields) if fields else PlackettLuce().beta

    raw: list[dict[str, Any]] = []
    for snap in rep.snapshots:
        if len(snap.teams) < MIN_TEAMS:
            continue
        people = [u for t in snap.teams for u in t.members]
        if not people:
            continue
        skills = sorted((final[u] for u in people), reverse=True)
        strengths = [team_strength(t.members, t.anonymous) for t in snap.teams]
        p_win = p_ref_wins(ref_mu, noise, strengths, [noise] * len(strengths))
        raw.append(
            {
                "event": snap.event,
                "series": series_of.get(snap.event, str(snap.event)),
                "teams": len(snap.teams),
                "hackers": len(people),
                "win_odds": 1 / max(p_win, 1e-12),
                "top_field": st.mean(skills[:10]),
                "field_mean": st.mean(skills),
                "elite": sum(
                    rep.ratings[u].mu - 3 * rep.ratings[u].sigma >= elite_cut
                    and events_of[u] >= MIN_EVENTS_FOR_ELITE
                    for u in people
                ),
                "judging": spearman([-p for p in snap.pre_team_mu], [t.rank for t in snap.teams]),
            }
        )
    if not raw:
        return [], [], noise

    z = {k: zscores([math.log(r[k]) if k == "win_odds" else math.log1p(r[k]) for r in raw]) for k in WEIGHTS}
    rows: list[EventRow] = []
    for i, fields_i in enumerate(raw):
        zi = sum(WEIGHTS[k] * z[k][i] for k in WEIGHTS)
        rows.append(EventRow(**fields_i, z=zi, rating=round(1000 + 100 * zi)))
    rows.sort(key=lambda r: -r.rating)

    by_series: dict[str, list[EventRow]] = defaultdict(list)
    for r in rows:
        by_series[r.series].append(r)
    series = []
    for key, eds in by_series.items():
        n = len(eds)
        shrunk = st.mean(e.z for e in eds) * n / (n + 1)  # one strong edition isn't a dynasty
        best = max(eds, key=lambda e: e.rating)
        series.append(
            SeriesRow(series=key, editions=n, rating=round(1000 + 100 * shrunk), best_event=best.event)
        )
    series.sort(key=lambda s: -s.rating)
    return rows, series, noise
