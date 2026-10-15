import { describe, expect, it } from "vitest";

import { type RankTierRow, validateRankTiers } from "@/lib/rank-tiers";

const DEFAULTS: RankTierRow[] = [
  { name: "Hall of Fame", top_percent: null, top_n: 100, position: 1 },
  { name: "Legend", top_percent: 1, top_n: null, position: 2 },
  { name: "Principal", top_percent: 5, top_n: null, position: 3 },
  { name: "Architect", top_percent: 15, top_n: null, position: 4 },
  { name: "Shipper", top_percent: 35, top_n: null, position: 5 },
  { name: "Committer", top_percent: 60, top_n: null, position: 6 },
  { name: "Hello World", top_percent: null, top_n: null, position: 7 },
];

const edit = (name: string, patch: Partial<RankTierRow>) => DEFAULTS.map((t) => (t.name === name ? { ...t, ...patch } : t));

describe("validateRankTiers", () => {
  it("accepts the defaults", () => {
    expect(validateRankTiers(DEFAULTS)).toEqual([]);
  });

  it.each([
    [edit("Hello World", { top_percent: 100 }), 'There must be exactly one "everyone else" tier (found 0).'],
    [edit("Hello World", { position: 0 }), 'The "everyone else" tier (Hello World) must be the lowest.'],
    [edit("Legend", { top_percent: 50 }), "Percentile bands must widen from the highest tier down (1% before 5% and so on)."],
    [edit("Legend", { top_n: 10 }), "Legend: use a top % or a top N, not both."],
    [edit("Legend", { top_percent: 0 }), "Legend: top % must be above 0 and at most 100."],
    [edit("Hall of Fame", { top_n: 1.5 }), "Hall of Fame: top N must be a whole number above 0."],
    [edit("Legend", { name: "principal" }), 'Two tiers are called "Principal".'],
    [edit("Legend", { name: " " }), "Every tier needs a name."],
  ])("rejects a broken set (%#)", (rows, problem) => {
    expect(validateRankTiers(rows)).toContain(problem);
  });
});
