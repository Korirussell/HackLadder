// The browser-side twin of pipeline/src/hackladder/prizes.py, used for the admin page's live
// preview and validation. The pipeline is the authority; tests/prize-tiers.test.ts runs every
// example from pipeline/config/prize_tiers.toml through this file so the two can't drift.

export type MatchOn = "stripped" | "full";

export type PrizeRule = {
  name: string;
  tier: number;
  pattern: string;
  match: MatchOn;
  examples: string[];
  enabled?: boolean;
};

export type Decision = { tier: number; reason: string };

const REWARD_TEXT = /\([^()]*\)|\[[^[\]]*\]/g;

/** "Best Use of X ($1k Cash [1st])" -> "Best Use of X". Removes one nesting level, like the pipeline. */
export function stripRewards(name: string): string {
  const once = name.replace(REWARD_TEXT, " ");
  return once.replace(REWARD_TEXT, " ").split(/\s+/).filter(Boolean).join(" ");
}

/** Compiles a rule pattern the way the pipeline does (case-insensitive). Null if invalid. */
export function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export function ruleMatches(rule: PrizeRule, prizeName: string): boolean {
  const re = compilePattern(rule.pattern);
  const text = rule.match === "full" ? prizeName : stripRewards(prizeName);
  return re !== null && re.test(text.trim());
}

export function classify(rules: PrizeRule[], defaultTier: number, prizeName: string): Decision {
  for (const rule of rules) {
    if (rule.enabled !== false && ruleMatches(rule, prizeName)) return { tier: rule.tier, reason: `rule: ${rule.name}` };
  }
  return { tier: defaultTier, reason: "default" };
}

/** Problems with a rule as the admin typed it, in plain language. Empty when it's valid. */
export function validateRule(rule: PrizeRule, allRules: PrizeRule[], defaultTier: number): string[] {
  const problems: string[] = [];
  if (!rule.name.trim()) problems.push("Give the rule a name.");
  if (!Number.isInteger(rule.tier) || rule.tier < 1 || rule.tier > 5) problems.push("Tier must be 1 to 5.");
  if (!rule.pattern.trim()) problems.push("Add a pattern.");
  else if (compilePattern(rule.pattern) === null) problems.push("The pattern isn't a valid regular expression.");
  if (problems.length) return problems;

  for (const example of rule.examples) {
    if (!ruleMatches(rule, example)) {
      problems.push(`"${example}" doesn't match this rule's pattern.`);
      continue;
    }
    // An earlier rule may claim the example first.
    const decided = classify(allRules, defaultTier, example);
    if (decided.reason !== `rule: ${rule.name}`) {
      problems.push(`"${example}" is caught first by ${decided.reason.replace("rule: ", "the rule ")}.`);
    }
  }
  return problems;
}
