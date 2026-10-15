import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";

import { classify, type PrizeRule, stripRewards, validateRule } from "@/lib/prize-tiers";

// The pipeline's default rules are the shared contract between Python and this preview.
const toml = parse(readFileSync(join(__dirname, "../../../pipeline/config/prize_tiers.toml"), "utf8")) as {
  default_tier: number;
  rules: Array<Omit<PrizeRule, "match" | "examples"> & { match?: PrizeRule["match"]; examples?: string[] }>;
};
const rules: PrizeRule[] = toml.rules.map((r) => ({ ...r, match: r.match ?? "stripped", examples: r.examples ?? [] }));

describe("prize tiers match the pipeline", () => {
  const cases = rules.flatMap((rule) => rule.examples.map((example) => [rule.name, rule.tier, example] as const));

  it.each(cases)("rule %s (tier %i) decides %s", (name, tier, example) => {
    expect(classify(rules, toml.default_tier, example)).toEqual({ tier, reason: `rule: ${name}` });
  });

  it("falls back to the default tier", () => {
    expect(classify(rules, toml.default_tier, "Most Impactful Hack (4x Apple Watch)")).toEqual({
      tier: toml.default_tier,
      reason: "default",
    });
  });

  it("strips reward text like the pipeline", () => {
    expect(stripRewards("Best Use of X ($1k Cash [1st] & $500 [2nd])")).toBe("Best Use of X");
    expect(stripRewards("Prize (outer (inner) text) [tag]")).toBe("Prize");
  });

  it("every default rule validates cleanly", () => {
    for (const rule of rules) expect(validateRule(rule, rules, toml.default_tier)).toEqual([]);
  });
});

describe("validateRule", () => {
  const base: PrizeRule = { name: "raffle", tier: 5, pattern: "\\braffle\\b", match: "stripped", examples: [] };

  it("reports a broken pattern, a bad tier and a missing name", () => {
    expect(validateRule({ ...base, pattern: "(" }, [], 2)).toEqual(["The pattern isn't a valid regular expression."]);
    expect(validateRule({ ...base, tier: 7 }, [], 2)).toEqual(["Tier must be 1 to 5."]);
    expect(validateRule({ ...base, name: " " }, [], 2)).toEqual(["Give the rule a name."]);
  });

  it("reports examples that don't match, or that an earlier rule catches", () => {
    const earlier: PrizeRule = { name: "anything prize", tier: 2, pattern: "prize", match: "stripped", examples: [] };
    const rule = { ...base, examples: ["Workshop Raffle Prize", "Best Hack"] };
    expect(validateRule(rule, [earlier, rule], 2)).toEqual([
      '"Workshop Raffle Prize" is caught first by the rule anything prize.',
      '"Best Hack" doesn\'t match this rule\'s pattern.',
    ]);
  });

  it("ignores disabled rules when deciding", () => {
    const disabled: PrizeRule = { name: "off", tier: 1, pattern: ".", match: "stripped", examples: [], enabled: false };
    expect(classify([disabled], 2, "anything")).toEqual({ tier: 2, reason: "default" });
  });
});
