from __future__ import annotations

import json
import os
from collections.abc import Iterator
from decimal import Decimal
from typing import Any

import psycopg
import pytest
from typer.testing import CliRunner

from hackladder.cli import app
from hackladder.config import (
    RankTier,
    RatingConfig,
    load_rating_config,
    prize_tiers_from_rows,
    rank_tier_for,
    rank_tiers_from_rows,
    seed_prize_rules,
    settings_from_row,
)
from hackladder.prizes import TierConfigError, load_tier_config

# Rows shaped like the database returns them (top_percent is numeric -> Decimal).
DEFAULT_RANK_ROWS: list[dict[str, Any]] = [
    {"name": "Hall of Fame", "top_percent": None, "top_n": 100, "position": 1},
    {"name": "Legend", "top_percent": Decimal("1.00"), "top_n": None, "position": 2},
    {"name": "Principal", "top_percent": Decimal("5.00"), "top_n": None, "position": 3},
    {"name": "Architect", "top_percent": Decimal("15.00"), "top_n": None, "position": 4},
    {"name": "Shipper", "top_percent": Decimal("35.00"), "top_n": None, "position": 5},
    {"name": "Committer", "top_percent": Decimal("60.00"), "top_n": None, "position": 6},
    {"name": "Hello World", "top_percent": None, "top_n": None, "position": 7},
]


def rule_row(name: str, tier: int, pattern: str, **kw: Any) -> dict[str, Any]:
    return {"name": name, "tier": tier, "pattern": pattern, "match": kw.get("match", "stripped"),
            "examples": kw.get("examples")}  # fmt: skip


# ---------------------------------------------------------------- rows -> config (no database)
def test_prize_tiers_from_rows() -> None:
    rules = [
        rule_row("raffle", 5, r"\braffle\b", examples=["Workshop Raffle"]),
        rule_row("overall", 1, "^grand prize$"),
    ]
    overrides = [{"event": "treehacks-2024", "prize_name": "Intel: Hard One", "tier": 3, "note": None}]
    config = prize_tiers_from_rows(rules, overrides, default_tier=2)
    assert config.tier("Workshop Raffle Prizes") == 5
    assert config.tier("Grand Prize ($10k Cash)") == 1
    assert config.tier("Most Creative Hack") == 2
    assert config.tier("Intel: Hard One", "treehacks-2024") == 3


def test_a_broken_rule_from_the_admin_page_fails_loudly_and_names_itself() -> None:
    with pytest.raises(TierConfigError, match=r"rules\[0\] \(oops\): bad pattern"):
        prize_tiers_from_rows([rule_row("oops", 1, "(unclosed")], [], default_tier=2)


def test_settings_from_row() -> None:
    row = {
        "default_prize_tier": 2,
        "provisional_min_events": 3,
        "inactive_after_months": 18,
        "mlh_digital_counts": False,
    }
    settings = settings_from_row(row)
    assert settings.provisional_min_events == 3
    assert not settings.mlh_digital_counts


def test_default_rank_tiers() -> None:
    tiers = rank_tiers_from_rows(list(reversed(DEFAULT_RANK_ROWS)))  # sorted by position
    assert [t.name for t in tiers][:2] == ["Hall of Fame", "Legend"]
    assert tiers[1].top_percent == 1.0


@pytest.mark.parametrize(
    ("rank", "top_percent", "expected"),
    [
        (1, 0.01, "Hall of Fame"),
        (100, 0.5, "Hall of Fame"),
        (101, 0.6, "Legend"),
        (900, 4.0, "Principal"),
        (2000, 15.0, "Architect"),
        (5000, 34.9, "Shipper"),
        (9000, 60.0, "Committer"),
        (12000, 80.0, "Hello World"),
    ],
)
def test_rank_tier_for(rank: int, top_percent: float, expected: str) -> None:
    assert rank_tier_for(rank_tiers_from_rows(DEFAULT_RANK_ROWS), rank, top_percent).name == expected


@pytest.mark.parametrize(
    ("rows", "message"),
    [
        (DEFAULT_RANK_ROWS[:-1], "exactly one 'everyone else' tier, found 0"),
        (
            [*DEFAULT_RANK_ROWS[:-1], {**DEFAULT_RANK_ROWS[-1], "position": 0}],
            "must be the lowest",
        ),
        (
            [{**r, "top_percent": Decimal("50")} if r["name"] == "Legend" else r for r in DEFAULT_RANK_ROWS],
            "percentile bands must widen",
        ),
    ],
)
def test_invalid_rank_tiers(rows: list[dict[str, Any]], message: str) -> None:
    with pytest.raises(TierConfigError, match=message):
        rank_tiers_from_rows(rows)


def test_snapshot_is_json() -> None:
    config = RatingConfig(
        settings=settings_from_row(
            {
                "default_prize_tier": 2,
                "provisional_min_events": 3,
                "inactive_after_months": 18,
                "mlh_digital_counts": False,
            }
        ),
        prize_tiers=load_tier_config(),
        rank_tiers=(RankTier("Everyone", None, None, 1),),
        rated_hackathon_ids=frozenset({3, 1}),
    )
    snap = json.loads(json.dumps(config.snapshot()))
    assert snap["rated_hackathon_ids"] == [1, 3]
    assert snap["prize_rules"][0]["name"] == "not a placement"


# ---------------------------------------------------------------- against a migrated database
needs_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="needs DATABASE_URL")


@pytest.fixture
def conn() -> Iterator[psycopg.Connection[Any]]:
    """A connection whose changes are rolled back after the test."""
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        # Open the transaction now: code under test that uses conn.transaction() then gets a
        # savepoint inside it, instead of committing its own top-level transaction.
        c.execute("select 1")
        try:
            yield c
        finally:
            c.rollback()


@pytest.mark.db
@needs_db
def test_seed_then_load_round_trips(conn: psycopg.Connection[Any]) -> None:
    conn.execute("delete from public.prize_tier_rules")
    toml = load_tier_config()
    assert seed_prize_rules(conn) == len(toml.rules)
    assert seed_prize_rules(conn) == 0  # already seeded: no-op
    assert seed_prize_rules(conn, replace=True) == len(toml.rules)

    config = load_rating_config(conn)
    assert [r.name for r in config.prize_tiers.rules] == [r.name for r in toml.rules]
    for rule in toml.rules:
        for example in rule.examples:
            assert config.prize_tiers.tier(example) == rule.tier
    assert config.prize_tiers.default_tier == toml.default_tier
    assert [t.name for t in config.rank_tiers][-1] == "Hello World"
    assert config.settings.provisional_min_events == 3


@pytest.mark.db
@needs_db
def test_scope_and_overrides_come_from_the_database(conn: psycopg.Connection[Any]) -> None:
    seed_prize_rules(conn, replace=True)
    hid = conn.execute(
        "insert into public.hackathons (source, source_id, slug, title, url, is_mlh)"
        " values ('test', 'cfg-db-1', 'cfg-db-flagship', 'Flagship', 'https://example.com', false)"
        " returning id"
    ).fetchone()
    assert hid is not None
    conn.execute("insert into public.hackathon_settings (hackathon_id, counts) values (%s, 'include')", hid)
    conn.execute(
        "insert into public.prize_tier_overrides (hackathon_id, prize_name, tier)"
        " values (%s, 'Hard Sponsor: Prize', 1)",
        hid,
    )
    config = load_rating_config(conn)
    assert hid[0] in config.rated_hackathon_ids
    assert config.prize_tiers.tier("Hard Sponsor: Prize", "cfg-db-flagship") == 1
    assert config.prize_tiers.tier("Hard Sponsor: Prize", "elsewhere") == 3


def test_hl_explains_the_ipv6_only_supabase_host(monkeypatch: pytest.MonkeyPatch) -> None:
    # .invalid never resolves, so this fails the same way an IPv6-only host does on an IPv4 network.
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres:pw@db.abcdef.supabase.co.invalid:5432/postgres")
    result = CliRunner(env={"COLUMNS": "400"}).invoke(app, ["config", "show"])
    assert result.exit_code == 2
    assert "Couldn't connect to the database" in result.output
    assert "Session pooler" in result.output
