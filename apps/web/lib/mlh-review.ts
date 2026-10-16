// Pure helpers for the /admin/mlh review queue. Candidates are written by the pipeline's
// `hl mlh match` (pipeline/src/hackladder/mlh.py, _candidate_json).

export type NameMatch = "exact" | "contains" | "fuzzy";

export type Candidate = {
  hackathon_id: number;
  slug: string;
  title: string;
  ends_on: string;
  score: number;
  days: number;
  name_match: NameMatch;
};

export type MatchStatus = "auto" | "suggested" | "confirmed" | "rejected" | "unmatched";

export type ReviewRow = {
  mlh_event_id: number;
  mlh_name: string;
  season: string;
  starts_at: string;
  ends_at: string;
  format: string;
  location: string | null;
  website_url: string | null;
  is_high_school: boolean;
  status: MatchStatus;
  score: number | null;
  note: string | null;
  hackathon_id: number | null;
  hackathon_slug: string | null;
  hackathon_title: string | null;
  hackathon_ends_on: string | null;
  candidates: Candidate[];
};

/** What a row was before an admin decided it, so the decision can be undone. */
export type PriorMatch = Pick<ReviewRow, "mlh_event_id" | "hackathon_id" | "score" | "status" | "note">;

const NAME_MATCHES = new Set<string>(["exact", "contains", "fuzzy"]);
const STATUSES = new Set<string>(["auto", "suggested", "confirmed", "rejected", "unmatched"]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Reads the jsonb column defensively: anything malformed is dropped, not rendered. */
export function parseCandidates(value: unknown): Candidate[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((c) =>
    typeof c.hackathon_id === "number" &&
    typeof c.slug === "string" &&
    typeof c.title === "string" &&
    typeof c.ends_on === "string" &&
    typeof c.score === "number" &&
    typeof c.days === "number" &&
    typeof c.name_match === "string" &&
    NAME_MATCHES.has(c.name_match)
      ? [{ ...(c as Candidate) }]
      : [],
  );
}

/** A view row (every column nullable) as a ReviewRow, or null if it isn't a usable row. */
export function toReviewRow(r: Record<string, unknown>): ReviewRow | null {
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  const num = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : null);
  const id = num("mlh_event_id");
  const status = str("status") ?? "unmatched";
  if (id === null || !STATUSES.has(status)) return null;
  return {
    mlh_event_id: id,
    mlh_name: str("mlh_name") ?? "",
    season: str("season") ?? "",
    starts_at: str("starts_at") ?? "",
    ends_at: str("ends_at") ?? "",
    format: str("format") ?? "",
    location: str("location"),
    website_url: str("website_url"),
    is_high_school: r.is_high_school === true,
    status: status as MatchStatus,
    score: num("score"),
    note: str("note"),
    hackathon_id: num("hackathon_id"),
    hackathon_slug: str("hackathon_slug"),
    hackathon_title: str("hackathon_title"),
    hackathon_ends_on: str("hackathon_ends_on"),
    candidates: parseCandidates(r.candidates),
  };
}

const named = (c: Candidate | undefined) => c?.name_match === "exact" || c?.name_match === "contains";

/**
 * "Likely right": the suggestion's name is the MLH name (or contains it, or is contained by it),
 * its deadline is within a day of the MLH end, and no other candidate's name does the same.
 * These are listed first and pre-checked, so one click confirms the batch.
 */
export function isLikelyRight(row: ReviewRow): boolean {
  if (row.status !== "suggested" || row.hackathon_id === null) return false;
  const top = row.candidates.find((c) => c.hackathon_id === row.hackathon_id);
  if (!top || !named(top) || top.days > 1) return false;
  return !row.candidates.some((c) => c.hackathon_id !== top.hackathon_id && named(c));
}

/** The candidates to offer, with the current match first even if the matcher didn't list it. */
export function choices(row: ReviewRow): Candidate[] {
  const list = [...row.candidates];
  if (row.hackathon_id !== null && !list.some((c) => c.hackathon_id === row.hackathon_id)) {
    const days =
      row.hackathon_ends_on && row.ends_at
        ? Math.abs(Math.round((Date.parse(row.hackathon_ends_on) - Date.parse(row.ends_at.slice(0, 10))) / 86_400_000))
        : 0;
    list.unshift({
      hackathon_id: row.hackathon_id,
      slug: row.hackathon_slug ?? "",
      title: row.hackathon_title ?? row.hackathon_slug ?? `#${row.hackathon_id}`,
      ends_on: row.hackathon_ends_on ?? "",
      score: row.score ?? 0,
      days,
      name_match: "fuzzy",
    });
  }
  return list;
}

/** Devpost search results nearest the MLH event's dates first. */
export function nearestFirst<T extends { ends_on: string | null }>(results: T[], near: string | null, limit = 8): T[] {
  if (!near) return results.slice(0, limit);
  const at = Date.parse(near);
  const gap = (r: T) => (r.ends_on ? Math.abs(Date.parse(r.ends_on) - at) : Number.POSITIVE_INFINITY);
  return [...results].sort((a, b) => gap(a) - gap(b)).slice(0, limit);
}

/** An ilike pattern matching every word in order: "cal hacks" -> "%cal%hacks%". Null if too short. */
export function searchPattern(q: string): string | null {
  const words = q.replaceAll(/[%_\\]/g, " ").trim().split(/\s+/).filter(Boolean);
  const pattern = words.join("%").slice(0, 80);
  return pattern.length >= 2 ? `%${pattern}%` : null;
}
