// HackLadder seasons run August to July (§16), named by both years: "2026-27".

export function seasonOf(d: Date): { start: number; name: string } {
  const start = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { start, name: `${start}-${String(start + 1).slice(2)}` };
}
