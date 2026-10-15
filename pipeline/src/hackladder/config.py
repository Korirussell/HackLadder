"""The admin-editable rating config (CLAUDE.md §8.7), read from Postgres.

Config is an input to the rating run: the pipeline loads it once per run, builds everything
from scratch with it, and stores ``RatingConfig.snapshot()`` in ``pipeline_runs.config_snapshot``.
The pure ``*_from_rows`` functions do the validation, so they're tested without a database.
"""

from __future__ import annotations

import tomllib
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row

from hackladder.prizes import CONFIG_PATH, TierConfig, TierConfigError, tier_config_from_mapping

Row = Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class RatingSettings:
    default_prize_tier: int
    provisional_min_events: int
    inactive_after_months: int
    mlh_digital_counts: bool


@dataclass(frozen=True, slots=True)
class RankTier:
    name: str
    top_percent: float | None  # e.g. 1.0 = top 1%
    top_n: int | None  # a title for the top N overall
    position: int  # 1 = highest


@dataclass(frozen=True, slots=True)
class RatingConfig:
    settings: RatingSettings
    prize_tiers: TierConfig
    rank_tiers: tuple[RankTier, ...]
    rated_hackathon_ids: frozenset[int]

    def snapshot(self) -> dict[str, Any]:
        """JSON-able record of exactly what a rating run used."""
        return {
            "settings": asdict(self.settings),
            "prize_rules": [
                {"name": r.name, "tier": r.tier, "pattern": r.pattern.pattern, "match": r.match}
                for r in self.prize_tiers.rules
            ],
            "prize_overrides": [
                {"event": o.event, "prize": o.prize, "tier": o.tier}
                for o in self.prize_tiers.overrides.values()
            ],
            "rank_tiers": [asdict(t) for t in self.rank_tiers],
            "rated_hackathon_ids": sorted(self.rated_hackathon_ids),
        }


def settings_from_row(row: Row) -> RatingSettings:
    return RatingSettings(
        default_prize_tier=int(row["default_prize_tier"]),
        provisional_min_events=int(row["provisional_min_events"]),
        inactive_after_months=int(row["inactive_after_months"]),
        mlh_digital_counts=bool(row["mlh_digital_counts"]),
    )


def prize_tiers_from_rows(rules: Sequence[Row], overrides: Sequence[Row], default_tier: int) -> TierConfig:
    """Build the prize TierConfig from ``prize_tier_rules`` (enabled, in position order) and
    ``prize_tier_overrides`` joined to the hackathon slug, with the same checks as the TOML."""
    return tier_config_from_mapping(
        {
            "default_tier": default_tier,
            "rules": [
                {
                    "name": r["name"],
                    "tier": int(r["tier"]),
                    "pattern": r["pattern"],
                    "match": r["match"],
                    "examples": list(r["examples"] or ()),
                }
                for r in rules
            ],
            "overrides": [
                {
                    "event": o["event"],
                    "prize": o["prize_name"],
                    "tier": int(o["tier"]),
                    "note": o["note"] or "",
                }
                for o in overrides
            ],
        }
    )


def rank_tiers_from_rows(rows: Sequence[Row]) -> tuple[RankTier, ...]:
    tiers = tuple(
        RankTier(
            name=r["name"],
            top_percent=float(r["top_percent"]) if r["top_percent"] is not None else None,
            top_n=int(r["top_n"]) if r["top_n"] is not None else None,
            position=int(r["position"]),
        )
        for r in sorted(rows, key=lambda r: int(r["position"]))
    )
    floors = [t for t in tiers if t.top_percent is None and t.top_n is None]
    if len(floors) != 1:
        raise TierConfigError(f"rank tiers need exactly one 'everyone else' tier, found {len(floors)}")
    if tiers[-1] is not floors[0]:
        raise TierConfigError(f"the 'everyone else' tier ({floors[0].name}) must be the lowest")
    bands = [t.top_percent for t in tiers if t.top_percent is not None]
    if bands != sorted(bands):
        raise TierConfigError("percentile bands must widen from the highest tier down (1% before 5% ...)")
    return tiers


def rank_tier_for(tiers: Sequence[RankTier], rank: int, top_percent: float) -> RankTier:
    """The tier for a non-provisional hacker at ``rank`` (1 = best) who is in the top
    ``top_percent`` percent. Top-N titles win over percentile bands."""
    for tier in tiers:
        if tier.top_n is not None and rank <= tier.top_n:
            return tier
    for tier in tiers:
        if tier.top_percent is not None and top_percent <= tier.top_percent:
            return tier
    return next(t for t in tiers if t.top_percent is None and t.top_n is None)


# ---------------------------------------------------------------- database I/O
def load_rating_config(conn: Connection[Any]) -> RatingConfig:
    with conn.cursor(row_factory=dict_row) as cur:
        settings = settings_from_row(_one(cur.execute("select * from public.rating_settings").fetchall()))
        rules = cur.execute(
            "select name, tier, pattern, match, examples from public.prize_tier_rules"
            " where enabled order by position"
        ).fetchall()
        overrides = cur.execute(
            "select h.slug as event, o.prize_name, o.tier, o.note"
            " from public.prize_tier_overrides o join public.hackathons h on h.id = o.hackathon_id"
        ).fetchall()
        rank_rows = cur.execute("select name, top_percent, top_n, position from public.rank_tiers").fetchall()
        rated = cur.execute("select hackathon_id from public.hackathon_scope where is_rated").fetchall()
    return RatingConfig(
        settings=settings,
        prize_tiers=prize_tiers_from_rows(rules, overrides, settings.default_prize_tier),
        rank_tiers=rank_tiers_from_rows(rank_rows),
        rated_hackathon_ids=frozenset(int(r["hackathon_id"]) for r in rated),
    )


def _one(rows: Sequence[Row]) -> Row:
    if len(rows) != 1:
        raise TierConfigError(f"expected exactly one rating_settings row, found {len(rows)}")
    return rows[0]


def seed_prize_rules(conn: Connection[Any], path: Path = CONFIG_PATH, *, replace: bool = False) -> int:
    """Load the default prize rules from ``path`` into ``prize_tier_rules``.

    Does nothing if rules already exist, unless ``replace``; never touches overrides.
    Returns the number of rules written.
    """
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    tier_config_from_mapping(data)  # validate before writing anything
    with conn.transaction(), conn.cursor() as cur:
        existing = cur.execute("select count(*) from public.prize_tier_rules").fetchone()
        if existing and existing[0] and not replace:
            return 0
        cur.execute("delete from public.prize_tier_rules")
        for position, rule in enumerate(data.get("rules", []), start=1):
            cur.execute(
                "insert into public.prize_tier_rules (position, name, tier, pattern, match, examples)"
                " values (%s, %s, %s, %s, %s, %s)",
                (position, rule["name"], rule["tier"], rule["pattern"], rule.get("match", "stripped"),
                 list(rule.get("examples", []))),
            )  # fmt: skip
        cur.execute("update public.rating_settings set default_prize_tier = %s", (data["default_tier"],))
        return len(data.get("rules", []))
