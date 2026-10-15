// Mirrors rank_tiers_from_rows() in pipeline/src/hackladder/config.py, so the admin page
// refuses a set of rank tiers the rating run would reject.

export type RankTierRow = {
  name: string;
  top_percent: number | null;
  top_n: number | null;
  position: number;
};

export function validateRankTiers(rows: RankTierRow[]): string[] {
  const tiers = [...rows].sort((a, b) => a.position - b.position);
  const problems: string[] = [];
  const names = new Set<string>();
  for (const t of tiers) {
    if (!t.name.trim()) problems.push("Every tier needs a name.");
    else if (names.has(t.name.trim().toLowerCase())) problems.push(`Two tiers are called "${t.name}".`);
    names.add(t.name.trim().toLowerCase());
    if (t.top_percent !== null && t.top_n !== null) problems.push(`${t.name}: use a top % or a top N, not both.`);
    if (t.top_percent !== null && !(t.top_percent > 0 && t.top_percent <= 100))
      problems.push(`${t.name}: top % must be above 0 and at most 100.`);
    if (t.top_n !== null && !(Number.isInteger(t.top_n) && t.top_n > 0))
      problems.push(`${t.name}: top N must be a whole number above 0.`);
  }
  const floors = tiers.filter((t) => t.top_percent === null && t.top_n === null);
  if (floors.length !== 1) problems.push(`There must be exactly one "everyone else" tier (found ${floors.length}).`);
  else if (tiers.at(-1) !== floors[0]) problems.push(`The "everyone else" tier (${floors[0].name}) must be the lowest.`);
  const bands = tiers.flatMap((t) => (t.top_percent === null ? [] : [t.top_percent]));
  if (bands.some((b, i) => i > 0 && b < bands[i - 1]))
    problems.push("Percentile bands must widen from the highest tier down (1% before 5% and so on).");
  return problems;
}
