// How a claimed owner arranges their profile (people.profile_layout, migration 20261021000100):
// the trophy cabinet's order, up to 3 pinned projects, hidden projects and a project layout.
// Display only: hidden projects still count for ratings. The database checks the same limits.

export const PROJECT_LAYOUTS = ["list", "cards", "compact"] as const;
export type ProjectLayout = (typeof PROJECT_LAYOUTS)[number];

export type ProfileLayout = {
  projects?: ProjectLayout;
  trophies?: string[]; // trophy keys, "<project id>:<prize name>"
  pinned?: number[]; // project ids
  hidden?: number[]; // project ids
};

export const MAX_PINNED = 3;
const MAX_TROPHIES = 300;
const MAX_HIDDEN = 500;

const isLayout = (v: unknown): v is ProjectLayout => PROJECT_LAYOUTS.includes(v as ProjectLayout);
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => Number.isSafeInteger(n) && n > 0) : []);
const keys = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && k.length <= 400) : []);

/** The layout with defaults filled in; tolerant of anything malformed. */
export function readLayout(raw: unknown): Required<ProfileLayout> {
  const l = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    projects: isLayout(l.projects) ? l.projects : "list",
    trophies: keys(l.trophies),
    pinned: ids(l.pinned).slice(0, MAX_PINNED),
    hidden: ids(l.hidden),
  };
}

/** Trophies in the owner's order (any not yet ordered keep the default order, after), minus hidden projects. */
export function arrangeTrophies<T extends { key: string; project_id: number }>(trophies: T[], raw: unknown): T[] {
  const layout = readLayout(raw);
  const hidden = new Set(layout.hidden);
  const position = new Map(layout.trophies.map((k, i) => [k, i]));
  const shown = trophies.filter((t) => !hidden.has(t.project_id));
  const ordered = shown.filter((t) => position.has(t.key)).sort((a, b) => position.get(a.key)! - position.get(b.key)!);
  return [...ordered, ...shown.filter((t) => !position.has(t.key))];
}

/** Pinned projects (in pin order) and the rest (default order), with hidden ones left out. */
export function arrangeProjects<E extends { project_id: number }>(events: E[], raw: unknown): { pinned: E[]; rest: E[] } {
  const layout = readLayout(raw);
  const hidden = new Set(layout.hidden);
  const byId = new Map(events.map((e) => [e.project_id, e]));
  const pinned = layout.pinned.flatMap((id) => {
    const e = byId.get(id);
    return e && !hidden.has(id) ? [e] : [];
  });
  const pinnedIds = new Set(pinned.map((e) => e.project_id));
  return { pinned, rest: events.filter((e) => !pinnedIds.has(e.project_id) && !hidden.has(e.project_id)) };
}

type Cleaned = { ok: true; layout: ProfileLayout } | { ok: false; error: string };

/**
 * A layout sent from the browser, checked against what this person actually has: only their own
 * trophy keys and project ids are kept, each once, within the database's limits.
 */
export function cleanLayout(input: unknown, own: { trophyKeys: Iterable<string>; projectIds: Iterable<number> }): Cleaned {
  if (!input || typeof input !== "object") return { ok: false, error: "That layout wasn't valid." };
  const l = input as Record<string, unknown>;
  if (l.projects !== undefined && !isLayout(l.projects)) return { ok: false, error: "Pick list, cards or compact." };
  const trophyKeys = new Set(own.trophyKeys);
  const projectIds = new Set(own.projectIds);
  const unique = <V>(xs: V[]) => [...new Set(xs)];
  const pinned = unique(ids(l.pinned)).filter((id) => projectIds.has(id));
  if (pinned.length > MAX_PINNED) return { ok: false, error: `Pin up to ${MAX_PINNED} projects.` };
  const hidden = unique(ids(l.hidden)).filter((id) => projectIds.has(id)).slice(0, MAX_HIDDEN);
  return {
    ok: true,
    layout: {
      projects: isLayout(l.projects) ? l.projects : "list",
      trophies: unique(keys(l.trophies)).filter((k) => trophyKeys.has(k)).slice(0, MAX_TROPHIES),
      pinned: pinned.filter((id) => !hidden.includes(id)),
      hidden,
    },
  };
}

/** Public URL of an uploaded profile photo (Supabase Storage bucket `avatars`). */
export function avatarUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/avatars/${path}`;
}
