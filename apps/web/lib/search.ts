// Search results as the dropdown and /search show them (§4.4: grouped hackers, schools, events).

export type SearchKind = "hacker" | "school" | "event";

export type SearchHit = {
  kind: SearchKind;
  slug: string;
  name: string;
  username: string | null;
  school: string | null;
  rank_score: number | null;
};

const ORDER: SearchKind[] = ["hacker", "school", "event"];
export const GROUP_LABEL: Record<SearchKind, string> = { hacker: "hackers", school: "schools", event: "events" };

/** Trimmed, at most 80 characters, at least 2; null when there's nothing to search for. */
export function normalizeQuery(q: string | null | undefined): string | null {
  const s = (q ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return s.length >= 2 ? s : null;
}

/** Groups in a fixed order, keeping the RPC's ranking inside each group. */
export function groupHits(hits: SearchHit[]): { kind: SearchKind; hits: SearchHit[] }[] {
  return ORDER.map((kind) => ({ kind, hits: hits.filter((h) => h.kind === kind) })).filter((g) => g.hits.length);
}

export function hitHref(hit: Pick<SearchHit, "kind" | "slug">): string {
  return `/${hit.kind === "hacker" ? "h" : hit.kind === "school" ? "s" : "e"}/${hit.slug}`;
}

export function hitDetail(hit: SearchHit): string {
  if (hit.kind === "hacker") return [hit.username && `@${hit.username}`, hit.school].filter(Boolean).join(" · ");
  if (hit.kind === "school") return "school";
  return "hackathon";
}
