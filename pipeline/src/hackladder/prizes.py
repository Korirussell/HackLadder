"""Prize tiers from ``config/prize_tiers.toml`` (CLAUDE.md §6.5).

Parsers return raw prize names; this module decides each one's tier. Because the rules are
versioned config, changing them re-tiers every stored prize without re-crawling.
"""

from __future__ import annotations

import re
import tomllib
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from hackladder.parse.common import host_of
from hackladder.parse.models import ProjectPage

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "prize_tiers.toml"

TIERS = range(1, 6)
NOT_A_PLACEMENT = 5

# Organizers often put the reward in the name: "Best Use of X ($1k Cash [1st] & ...)".
_REWARD_TEXT = re.compile(r"\([^()]*\)|\[[^\[\]]*\]")

MatchOn = Literal["stripped", "full"]


class TierConfigError(ValueError):
    pass


def strip_rewards(name: str) -> str:
    """Remove parenthesized and bracketed reward descriptions (one nesting level deep)."""
    once = _REWARD_TEXT.sub(" ", name)
    return " ".join(_REWARD_TEXT.sub(" ", once).split())


@dataclass(frozen=True, slots=True)
class Rule:
    name: str
    tier: int
    pattern: re.Pattern[str]
    match: MatchOn = "stripped"
    examples: tuple[str, ...] = ()

    def matches(self, prize_name: str) -> bool:
        text = prize_name if self.match == "full" else strip_rewards(prize_name)
        return self.pattern.search(text.strip()) is not None


@dataclass(frozen=True, slots=True)
class Override:
    event: str
    prize: str
    tier: int
    note: str = ""


@dataclass(frozen=True, slots=True)
class Decision:
    tier: int
    reason: str  # "override", "rule: <name>" or "default"

    @property
    def is_default(self) -> bool:
        return self.reason == "default"


@dataclass(frozen=True, slots=True)
class TierConfig:
    rules: tuple[Rule, ...]
    default_tier: int
    labels: dict[int, str] = field(default_factory=dict)
    overrides: dict[tuple[str, str], Override] = field(default_factory=dict)

    def classify(self, prize_name: str, event: str | None = None) -> Decision:
        """Tier for ``prize_name`` at ``event`` (the event's Devpost subdomain, e.g. treehacks-2024)."""
        if event is not None and (o := self.overrides.get((event.lower(), prize_name.strip()))):
            return Decision(o.tier, "override")
        for rule in self.rules:
            if rule.matches(prize_name):
                return Decision(rule.tier, f"rule: {rule.name}")
        return Decision(self.default_tier, "default")

    def tier(self, prize_name: str, event: str | None = None) -> int:
        return self.classify(prize_name, event).tier


def _tier(value: Any, where: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value not in TIERS:
        raise TierConfigError(f"{where}: tier must be an integer 1-5, got {value!r}")
    return value


def _only_keys(table: dict[str, Any], allowed: set[str], where: str) -> None:
    unknown = set(table) - allowed
    if unknown:
        raise TierConfigError(f"{where}: unknown key(s) {sorted(unknown)}; allowed: {sorted(allowed)}")


def _rule(raw: dict[str, Any], i: int) -> Rule:
    where = f"rules[{i}] ({raw.get('name', '?')})"
    _only_keys(raw, {"name", "tier", "pattern", "match", "examples"}, where)
    if not raw.get("name") or not raw.get("pattern"):
        raise TierConfigError(f"{where}: needs a name and a pattern")
    match = raw.get("match", "stripped")
    if match not in ("stripped", "full"):
        raise TierConfigError(f"{where}: match must be 'stripped' or 'full', got {match!r}")
    try:
        pattern = re.compile(raw["pattern"], re.IGNORECASE)
    except re.error as exc:
        raise TierConfigError(f"{where}: bad pattern: {exc}") from exc
    return Rule(
        name=raw["name"],
        tier=_tier(raw.get("tier"), where),
        pattern=pattern,
        match=match,
        examples=tuple(raw.get("examples", ())),
    )


def parse_tier_config(text: str) -> TierConfig:
    try:
        data = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise TierConfigError(f"not valid TOML: {exc}") from exc
    return tier_config_from_mapping(data)


def tier_config_from_mapping(data: dict[str, Any]) -> TierConfig:
    """Validate and build a TierConfig from the TOML's shape, whether it came from the file
    or from the database (``hackladder.config``), so both get exactly the same checks."""
    _only_keys(data, {"default_tier", "tiers", "rules", "overrides"}, "prize tier config")

    overrides: dict[tuple[str, str], Override] = {}
    for i, raw in enumerate(data.get("overrides", [])):
        where = f"overrides[{i}]"
        _only_keys(raw, {"event", "prize", "tier", "note"}, where)
        if not raw.get("event") or not raw.get("prize"):
            raise TierConfigError(f"{where}: needs an event and a prize")
        o = Override(
            raw["event"].lower(), raw["prize"].strip(), _tier(raw.get("tier"), where), raw.get("note", "")
        )
        if (o.event, o.prize) in overrides:
            raise TierConfigError(f"{where}: duplicate override for {o.event} / {o.prize!r}")
        overrides[(o.event, o.prize)] = o

    return TierConfig(
        rules=tuple(_rule(raw, i) for i, raw in enumerate(data.get("rules", []))),
        default_tier=_tier(data.get("default_tier"), "default_tier"),
        labels={int(k): str(v) for k, v in data.get("tiers", {}).items()},
        overrides=overrides,
    )


def load_tier_config(path: Path = CONFIG_PATH) -> TierConfig:
    return parse_tier_config(path.read_text(encoding="utf-8"))


@dataclass(frozen=True, slots=True)
class ReviewRow:
    event: str
    prize: str
    decision: Decision
    projects: int


def review(pages: Iterable[ProjectPage], config: TierConfig) -> list[ReviewRow]:
    """Every (event, prize name) across ``pages`` with its tier, for ``hl prizes``.

    Sorted by tier, then by how the tier was decided, so rule changes are easy to eyeball.
    """
    counts: Counter[tuple[str, str]] = Counter()
    for page in pages:
        for sub in page.submissions:
            event = host_of(sub.hackathon_url).split(".")[0]
            for prize in sub.prizes:
                counts[(event, prize)] += 1
    rows = [ReviewRow(e, p, config.classify(p, e), n) for (e, p), n in counts.items()]
    return sorted(rows, key=lambda r: (r.decision.tier, r.decision.reason, r.event, r.prize))
