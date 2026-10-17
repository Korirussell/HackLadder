// Formatting for the public pages. Pure, so it's unit-tested (tests/format.test.ts).

const MINUS = "−";

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US");
}

/** A rating change: "+41", "−8", "±0" (§4.1: up is accent, down and unchanged are muted). */
export function signed(n: number | null | undefined): string {
  if (!n) return "±0";
  return n > 0 ? `+${num(n)}` : `${MINUS}${num(-n)}`;
}

export function changeTone(n: number | null | undefined): "up" | "down" | "flat" {
  return !n ? "flat" : n > 0 ? "up" : "down";
}

/** Countdown in timecode format, DD:HH:MM:SS (§4.3). Never negative. */
export function timecode(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const parts = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  return parts.map((n) => String(n).padStart(2, "0")).join(":");
}

/** "1 in 214": the chance a 90th-percentile team takes first (§8.2). */
export function odds(winOdds: number | null | undefined): string {
  return winOdds && winOdds > 0 ? `1 in ${num(Math.max(1, winOdds))}` : "unrated";
}

/** A file-style window title: "TreeHacks 2026" -> "treehacks_2026.mov". */
export function fileName(title: string, ext = ""): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "untitled";
  return ext ? `${base}.${ext}` : base;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0][0], words.at(-1)![0]] : [...(words[0] ?? "?")].slice(0, 2);
  return letters.join("").toUpperCase();
}

/** "Top 3%", "Top 0.4%": percentile is the top share in percent (ratings.percentile). */
export function topPercent(p: number | null | undefined): string | null {
  if (p === null || p === undefined) return null;
  if (p >= 1) return `Top ${Math.round(p)}%`;
  return `Top ${Number(p.toPrecision(1))}%`;
}

const TIER_LABEL: Record<number, string> = { 1: "grand prize", 2: "track winner", 3: "sponsor prize", 4: "tech prize" };

export function tierLabel(tier: number | null | undefined): string {
  return (tier && TIER_LABEL[tier]) || "submitted";
}

const UTC = { timeZone: "UTC" } as const;

/** "2026-10-05" */
export function isoDate(d: string | null | undefined): string {
  return d ? d.slice(0, 10) : "—";
}

/** "Oct 2026" */
export function monthYear(d: string | null | undefined, month: "short" | "long" = "short"): string {
  return d ? new Date(d).toLocaleDateString("en-US", { ...UTC, month, year: "numeric" }) : "—";
}

/** "Feb 14–16, 2026", "Dec 28, 2025 – Jan 2, 2026", or one date. */
export function dateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!end) return start ? new Date(start).toLocaleDateString("en-US", { ...UTC, dateStyle: "medium" }) : "—";
  const e = new Date(end);
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...UTC, ...o });
  if (!start || start.slice(0, 10) === end.slice(0, 10)) return fmt(e, { dateStyle: "medium" });
  const s = new Date(start);
  if (s.getUTCFullYear() !== e.getUTCFullYear()) return `${fmt(s, { dateStyle: "medium" })} – ${fmt(e, { dateStyle: "medium" })}`;
  if (s.getUTCMonth() !== e.getUTCMonth())
    return `${fmt(s, { month: "short", day: "numeric" })} – ${fmt(e, { month: "short", day: "numeric" })}, ${e.getUTCFullYear()}`;
  return `${fmt(s, { month: "short", day: "numeric" })}–${e.getUTCDate()}, ${e.getUTCFullYear()}`;
}

export const devpostProject = (slug: string) => `https://devpost.com/software/${encodeURIComponent(slug)}`;
export const devpostUser = (username: string) => `https://devpost.com/${encodeURIComponent(username)}`;

export function pages(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** A ?page= value as a 1-based page number within range. */
export function pageParam(value: string | string[] | undefined, last = Number.POSITIVE_INFINITY): number {
  const n = Number.parseInt(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, last) : 1;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}
