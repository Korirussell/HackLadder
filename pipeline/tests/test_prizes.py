from __future__ import annotations

import gzip
import re
from pathlib import Path

import pytest
from conftest import FIXTURES, read_fixture
from typer.testing import CliRunner

from hackladder.cli import app
from hackladder.parse import parse_project
from hackladder.prizes import (
    NOT_A_PLACEMENT,
    TierConfigError,
    load_tier_config,
    parse_tier_config,
    review,
    strip_rewards,
)

CONFIG = load_tier_config()


# ---------------------------------------------------------------- the real config
@pytest.mark.parametrize(
    ("rule_name", "example"),
    [(rule.name, example) for rule in CONFIG.rules for example in rule.examples],
)
def test_every_example_lands_in_its_own_rule(rule_name: str, example: str) -> None:
    rule = next(r for r in CONFIG.rules if r.name == rule_name)
    decision = CONFIG.classify(example)
    assert decision.reason == f"rule: {rule_name}", f"{example!r} was decided by {decision.reason}"
    assert decision.tier == rule.tier


def test_every_rule_has_examples_and_every_tier_has_a_label() -> None:
    assert all(rule.examples for rule in CONFIG.rules)
    assert sorted(CONFIG.labels) == [1, 2, 3, 4, 5]


@pytest.mark.parametrize(
    ("name", "tier"),
    [
        # Real TreeHacks 2024 prizes, tiered the way the owner described (§6.5).
        ("Grand Prize ($10k Cash)", 1),
        ("Health Grand Prize (4x Oura Ring)", 2),
        ("Most Technically Complex Hack (4x Mac Mini)", 2),
        ("Best Hardware Hack (4x Prusa 3D Printers)", 2),
        ("Reazon Holdings: Best Senior-Focused Hack (4x Round Trip Tickets to Tokyo)", 3),
        ("Best Beginner Hack (4x Razer Keyboard + Mouse)", 3),
        ("Bun: Best Use of Zig (4x iPad Pro + Interview with Bun Founder)", 4),
        (
            "Intel: Best Use of Intel Developer Cloud ($10k Credits + 4x Lenovo AI PC [1st] & "
            "$4k Credits [2nd] & $2k Credits [3rd])",
            4,
        ),
        ("Workshop Raffle Prizes ($10k in Prizes)", NOT_A_PLACEMENT),
    ],
)
def test_real_prize_names(name: str, tier: int) -> None:
    assert CONFIG.tier(name, "treehacks-2024") == tier


def test_unmatched_names_get_the_default_tier() -> None:
    decision = CONFIG.classify("Most Impactful Hack (4x Apple Watch Series 9)")
    assert decision.is_default
    assert decision.tier == CONFIG.default_tier == 2


def test_strip_rewards() -> None:
    assert strip_rewards("Best Use of X ($1k Cash [1st] & $500 [2nd])") == "Best Use of X"
    assert strip_rewards("Prize (outer (inner) text) [tag]") == "Prize"
    assert strip_rewards("Plain") == "Plain"


# ---------------------------------------------------------------- overrides
OVERRIDE_CONFIG = """
default_tier = 2
[[rules]]
name = "best use of"
tier = 4
pattern = 'best use of'
[[overrides]]
event = "TreeHacks-2024"
prize = "Intel: Best Use of Intel Developer Cloud"
tier = 3
note = "hard sponsor challenge"
"""


def test_override_applies_to_its_event_only() -> None:
    config = parse_tier_config(OVERRIDE_CONFIG)
    prize = "Intel: Best Use of Intel Developer Cloud"
    assert config.classify(prize, "treehacks-2024").reason == "override"
    assert config.tier(prize, "treehacks-2024") == 3
    assert config.tier(prize, "treehacks-2025") == 4
    assert config.tier(prize) == 4


# ---------------------------------------------------------------- validation
@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("default_tier = 7", "tier must be an integer 1-5"),
        ("default_tier = true", "tier must be an integer 1-5"),
        ("default_tier = 2\ncolour = 1", "unknown key"),
        ("default_tier = 2\n[[rules]]\nname = 'x'\ntier = 1\npattern = '('", "bad pattern"),
        ("default_tier = 2\n[[rules]]\nname = 'x'\ntier = 1\npattern = 'x'\nmatch = 'raw'", "match must be"),
        ("default_tier = 2\n[[rules]]\ntier = 1\npattern = 'x'", "needs a name and a pattern"),
        ("default_tier = 2\n[[rules]]\nname = 'x'\ntier = 1\npattern = 'x'\nexample = ['y']", "unknown key"),
        ("default_tier = 2\n[[overrides]]\nprize = 'x'\ntier = 1", "needs an event and a prize"),
        (
            "default_tier = 2\n" + "[[overrides]]\nevent = 'e'\nprize = 'x'\ntier = 1\n" * 2,
            "duplicate override",
        ),
        ("default_tier = ", "not valid TOML"),
    ],
)
def test_invalid_config_is_rejected(text: str, message: str) -> None:
    with pytest.raises(TierConfigError, match=re.escape(message)):
        parse_tier_config(text)


# ---------------------------------------------------------------- review and `hl prizes`
def test_review_lists_every_event_and_prize() -> None:
    pages = [
        parse_project(read_fixture(f"project/{slug}.html"), "")
        for slug in ("sequoia-tgnryh", "baymax-your-personal-healthcare-companion")
    ]
    rows = review(pages, CONFIG)
    by_event = {(r.event, r.prize): r for r in rows}
    assert by_event[("share", "Best Project Demo on Devpost")].decision.is_default
    assert by_event[("treehacks-2024", "Grand Prize ($10k Cash)")].decision.tier == 1
    assert {r.event for r in rows} >= {"share", "hackathome", "treehacks-2024"}
    assert rows == sorted(rows, key=lambda r: (r.decision.tier, r.decision.reason, r.event, r.prize))


@pytest.fixture
def fixture_cache(tmp_path: Path) -> Path:
    """A raw cache holding the saved project, gallery and user fixtures."""
    for path in [*FIXTURES.glob("project/*.html"), *FIXTURES.glob("user/*.html")]:
        (tmp_path / f"{path.stem}.gz").write_bytes(gzip.compress(path.read_bytes()))
    return tmp_path


def test_hl_prizes(fixture_cache: Path, tmp_path: Path) -> None:
    out_csv = tmp_path / "prizes.csv"
    result = CliRunner().invoke(app, ["prizes", "--cache-dir", str(fixture_cache), "--csv", str(out_csv)])
    assert result.exit_code == 0, result.output
    assert "Tier 1: Grand prize" in result.output
    assert "rule: not a placement" in result.output
    assert "Workshop Raffle Prizes" in result.output
    assert out_csv.read_text(encoding="utf-8").startswith("tier,decided_by,event,projects,prize")


def test_hl_prizes_filters(fixture_cache: Path) -> None:
    runner = CliRunner()
    defaults = runner.invoke(app, ["prizes", "--cache-dir", str(fixture_cache), "--default"])
    assert defaults.exit_code == 0
    assert "rule:" not in defaults.output
    assert "default" in defaults.output

    one_event = runner.invoke(
        app, ["prizes", "--cache-dir", str(fixture_cache), "--event", "share", "--tier", "2"]
    )
    assert one_event.exit_code == 0
    assert "Best Project Demo on Devpost" in one_event.output
    assert "treehacks-2024" not in one_event.output


def test_hl_prizes_reports_a_broken_config(fixture_cache: Path, tmp_path: Path) -> None:
    bad = tmp_path / "bad.toml"
    bad.write_text("default_tier = 9", encoding="utf-8")
    # Wide terminal so the error panel does not wrap the message.
    runner = CliRunner(env={"COLUMNS": "300"})
    result = runner.invoke(app, ["prizes", "--cache-dir", str(fixture_cache), "--tiers", str(bad)])
    assert result.exit_code == 2
    assert "tier must be an integer 1-5" in result.output
