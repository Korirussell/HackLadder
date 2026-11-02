// Add-me requests (spec docs/superpowers/specs/2026-10-29-find-yourself-design.md): the username
// rule, links and copy shared by /add, its status page and the no-results states. Pure, so tested.

/** A Devpost username, as the database, the workflow and the pipeline check it. */
export const DEVPOST_USERNAME = /^[A-Za-z0-9_-]{1,40}$/;

export const POLL_MS = 4000;
export const POLL_FOR_MS = 10 * 60 * 1000;

export type AddStatus =
  | "queued" | "looking_up" | "already_here" | "crawling" | "live" | "nothing_counts" | "not_found" | "failed"; // prettier-ignore
export type AddEventState = "rated" | "queued" | "backlog" | "loaded" | "doesnt_count";
export type AddEvent = { slug: string; title: string; ends_on: string | null; state: AddEventState; reason: string | null };
export type AddRequest = { username: string; status: AddStatus; events: AddEvent[]; person_slug: string | null; updated_at: string };

/** A username from what people type or paste: "@name", "devpost.com/name", a full URL. */
export function asUsername(raw: string | null | undefined): string | null {
  const u = (raw ?? "")
    .trim()
    .replace(/^@/, "")
    .replace(/^(https?:\/\/)?(www\.)?devpost\.com\//i, "")
    .replace(/[/?#].*$/, "");
  return DEVPOST_USERNAME.test(u) ? u : null;
}

/** A URL path segment, decoded; null when its percent-encoding is malformed ("%E0%A4%A"), where
 * decodeURIComponent throws, so a bad link is a 404 or a 400 rather than a 500. */
export function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Where "Not here? Add yourself" goes, pre-filled when the search looked like a username. */
export function addHref(q?: string | null): string {
  const u = asUsername(q);
  return u ? `/add?u=${encodeURIComponent(u)}` : "/add";
}

export function isFinished(s: AddStatus): boolean {
  return s !== "queued" && s !== "looking_up" && s !== "crawling";
}

export const EVENT_STATE_LABEL: Record<AddEventState, string> = {
  rated: "rated",
  queued: "queued",
  backlog: "queued for the daily crawl",
  loaded: "loaded",
  doesnt_count: "doesn't count",
};

export function statusCopy(r: AddRequest): { title: string; body: string } {
  switch (r.status) {
    case "queued":
    case "looking_up":
      return { title: "Reading your Devpost profile…", body: "This takes a minute or two. Keep this page open." };
    case "already_here":
      return { title: "You're already on HackLadder", body: "Every hackathon of yours that counts is already rated." };
    case "crawling":
      return {
        title: "Loading your events",
        body: "Your rating publishes when this run finishes, usually within the hour. If the daily crawl is running (09:00–14:00 UTC), it can take until about 14:00 UTC.",
      };
    case "live":
      return { title: "You're live", body: "Your profile now includes these events." };
    case "nothing_counts":
      return {
        title: "None of these count yet",
        body: "Ratings come from in-person MLH member events with announced winners. Online jams and corporate challenges don't count.",
      };
    case "not_found":
      return { title: `No Devpost user called ${r.username}`, body: `Check devpost.com/${r.username} and try again.` };
    case "failed":
      return { title: "We couldn't reach Devpost", body: "Try again in a few minutes." };
  }
}
