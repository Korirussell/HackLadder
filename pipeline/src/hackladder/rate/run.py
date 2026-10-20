"""`hl rate`: rebuild every rating output from scratch and publish it (§7.6, §8, §8.7).

Reads the admin config and the rated events, replays them, writes the *_next shadow tables,
swaps them in with publish_gold() in one transaction, and refreshes search. Never edits a
rating row by hand: change the inputs (config, corrections) and rerun.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

from psycopg.types.json import Jsonb

from hackladder.config import RatingConfig, load_rating_config
from hackladder.db import Connection
from hackladder.rate.crews import crews
from hackladder.rate.events import analyze, series_key
from hackladder.rate.model import Event, Team, display, prize_bonus, replay, team_rank

MIN_SCHOOL_MEMBERS = 5
SCHOOL_TOP_N = 10


@dataclass(frozen=True, slots=True)
class RateSummary:
    events: int
    people: int
    ranked: int
    series: int
    crews: int
    noise: float


def season_of(d: date) -> str:
    """Aug-Jul seasons (§16): 2025-08-01 -> '2025-26'."""
    start = d.year if d.month >= 8 else d.year - 1
    return f"{start}-{str(start + 1)[2:]}"


def load_events(
    conn: Connection, config: RatingConfig
) -> tuple[list[Event], dict[int, tuple[str, str, str]]]:
    """Rated events as model input, plus id -> (slug, url, title) for series and tiers."""
    meta = {
        int(r[0]): (str(r[1]), str(r[2]), str(r[3]))
        for r in conn.execute(
            "select id, slug, url, title from public.hackathons where id = any(%s) and ends_on is not null",
            (sorted(config.rated_hackathon_ids),),
        ).fetchall()
    }
    teams: dict[int, list[Team]] = defaultdict(list)
    rows = conn.execute(
        "select p.hackathon_id, p.source_id, p.is_winner, p.anonymous_members,"
        " coalesce(array_agg(distinct a.person_id) filter (where a.person_id is not null), '{}'),"
        " coalesce(array_agg(distinct w.prize_name) filter (where w.prize_name is not null), '{}')"
        " from public.projects p"
        " left join public.project_members m on m.project_id = p.id"
        " left join public.accounts a on a.id = m.account_id"
        " left join public.prizes_won w on w.project_id = p.id"
        " where p.hackathon_id = any(%s) group by p.id order by p.source_id",
        (list(meta),),
    ).fetchall()
    for hid, key, is_winner, anonymous, people, prizes in rows:
        slug = meta[hid][0]
        tiers = [config.prize_tiers.tier(name, slug) for name in prizes]
        teams[hid].append(
            Team(
                str(key),
                team_rank(tiers, bool(is_winner)),
                tuple(sorted(people)),
                int(anonymous),
                prize_bonus(tiers),
            )
        )
    ends = dict(
        conn.execute("select id, ends_on from public.hackathons where id = any(%s)", (list(meta),)).fetchall()
    )
    events = [Event(hid, ends[hid], tuple(ts)) for hid, ts in teams.items()]
    return events, meta


def _series_ids(
    conn: Connection, keys: dict[int, str], meta: dict[int, tuple[str, str, str]]
) -> dict[str, int]:
    """Upsert event_series and point hackathons at them (manual series_overrides win)."""
    ids: dict[str, int] = {}
    for hid, key in keys.items():
        if key not in ids:
            name = re.sub(r"\s*(19|20)\d{2}.*$", "", meta[hid][2]) or key
            row = conn.execute(
                "insert into public.event_series (slug, name) values (%s, %s)"
                " on conflict (slug) do update set slug = excluded.slug returning id",
                (key, name),
            ).fetchone()
            assert row is not None
            ids[key] = int(row[0])
        conn.execute(
            "update public.hackathons h set series_id = coalesce("
            " (select o.series_id from public.series_overrides o where o.hackathon_id = h.id), %s)"
            " where h.id = %s",
            (ids[key], hid),
        )
    return ids


def run_ratings(conn: Connection) -> RateSummary:
    config = load_rating_config(conn)
    events, meta = load_events(conn, config)
    rep = replay(events)
    keys = {hid: series_key(meta[hid][1], meta[hid][2]) for hid in meta}
    event_rows, series_rows, noise = analyze(rep, keys)
    series_ids = _series_ids(conn, keys, meta)

    for table in (
        "ratings",
        "rating_history",
        "hackathon_strength",
        "series_strength",
        "crews",
        "school_ratings",
    ):
        conn.execute(f"truncate public.{table}_next")

    min_events = config.settings.provisional_min_events
    scores = {p: display(r.mu, r.sigma) for p, r in rep.ratings.items()}
    ranked = sorted((p for p in scores if rep.stats[p].events >= min_events), key=lambda p: -scores[p])
    top_percent = {p: 100 * (i + 1) / len(ranked) for i, p in enumerate(ranked)}
    with conn.cursor() as cur:
        cur.executemany(
            "insert into public.ratings_next values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [
                (p, r.mu, r.sigma, scores[p], s.events, s.placements, s.grand_prizes, s.last_event_on,
                 top_percent.get(p), p not in top_percent)
                for p, r in rep.ratings.items()
                for s in (rep.stats[p],)
            ],
        )  # fmt: skip
        cur.executemany(
            "insert into public.rating_history_next values (%s, %s, %s, %s, %s)",
            [(h.person, h.event, h.ends_on, h.score_before, h.score_after) for h in rep.history],
        )
        cur.executemany(
            "insert into public.hackathon_strength_next values (%s, %s, %s, %s, %s, %s, %s, %s)",
            [(r.event, r.teams, r.field_mean, r.top_field, r.elite, r.win_odds, r.rating, r.judging)
             for r in event_rows],
        )  # fmt: skip
        cur.executemany(
            "insert into public.series_strength_next values (%s, %s, %s, %s)",
            [(series_ids[s.series], s.editions, s.rating, s.best_event) for s in series_rows],
        )
        board = crews(rep.entries)
        cur.executemany(
            "insert into public.crews_next (members, events_together, placements_together,"
            " overperformance, score) values (%s, %s, %s, %s, %s)",
            [(sorted(c.members), c.events, c.placements, c.overperformance, c.score) for c in board],
        )
        cur.executemany(
            "insert into public.school_ratings_next values (%s, %s, %s, %s, %s)",
            _school_rows(conn, rep, scores, ranked),
        )
    run_row = conn.execute("insert into public.pipeline_runs (job) values ('rate') returning id").fetchone()
    assert run_row is not None
    conn.execute("select public.publish_gold()")
    conn.execute(
        "update public.pipeline_runs set finished_at = now(), status = 'succeeded', people_rated = %s,"
        " config_snapshot = %s, summary = %s where id = %s",
        (
            len(rep.ratings),
            Jsonb(config.snapshot()),
            Jsonb({"events": len(rep.snapshots), "noise": noise}),
            run_row[0],
        ),
    )
    conn.commit()
    conn.execute("refresh materialized view concurrently public.search_index")
    conn.commit()
    return RateSummary(len(rep.snapshots), len(rep.ratings), len(ranked), len(series_rows), len(board), noise)


def _school_rows(
    conn: Connection, rep: Any, scores: dict[Any, int], ranked: list[Any]
) -> list[tuple[Any, ...]]:
    """§8.4: per season, mean score of a school's top 10 non-provisional hackers active that season."""
    school_of = dict(
        conn.execute("select id, school_id from public.people where school_id is not null").fetchall()
    )
    eligible = set(ranked)
    active: dict[tuple[int, str], set[Any]] = defaultdict(set)
    for h in rep.history:
        if h.person in school_of and h.person in eligible:
            active[(school_of[h.person], season_of(h.ends_on))].add(h.person)
    by_season: dict[str, list[tuple[int, float, int]]] = defaultdict(list)
    for (school, season), people in active.items():
        if len(people) >= MIN_SCHOOL_MEMBERS:
            top = sorted((scores[p] for p in people), reverse=True)[:SCHOOL_TOP_N]
            by_season[season].append((school, sum(top) / len(top), len(people)))
    rows = []
    for season, entries in by_season.items():
        for rank, (school, avg, n) in enumerate(sorted(entries, key=lambda e: -e[1]), start=1):
            rows.append((school, season, avg, n, rank))
    return rows
