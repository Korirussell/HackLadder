// Shapes of the jsonb the page functions return (supabase/migrations/20261016000400_public_site.sql).
// Generated types only say `Json` for these, so they're declared here and read through asPage().

import type { ThemeId } from "./theme";

export type HackerEvent = {
  slug: string;
  title: string;
  ends_on: string | null;
  project: string;
  project_slug: string;
  prize: string | null;
  tier: number | null;
  change: number | null;
};

export type HackerPage = {
  slug: string;
  display_name: string;
  is_claimed: boolean;
  profile_theme: ThemeId | null;
  bio: string | null;
  links: { linkedin?: string; github?: string; website?: string };
  school: { slug: string; name: string } | null;
  usernames: string[];
  rating: {
    score: number;
    events: number;
    placements: number;
    grand_prizes: number;
    percentile: number | null;
    provisional: boolean;
    last_event_on: string | null;
    mu: number;
    sigma: number;
  } | null;
  rank: number | null;
  board_size: number;
  tier: string | null;
  month_change: number;
  history: { ends_on: string | null; score: number; event: string }[];
  events: HackerEvent[];
  teammates: { slug: string; name: string; events: number }[];
  best_crew: { members: { slug: string; name: string }[]; events: number; score: number | null } | null;
  toughest_win: { slug: string; title: string; prize: string; win_odds: number | null } | null;
  active_since: string | null;
};

export type EventWinner = {
  title: string;
  project_slug: string;
  tagline: string | null;
  tier: number;
  prizes: string[];
  team_rating: number | null;
  members: { slug: string | null; name: string }[];
};

export type EventPage = {
  slug: string;
  title: string;
  url: string;
  organization: string | null;
  location: string | null;
  is_online: boolean;
  starts_on: string | null;
  ends_on: string | null;
  registrations: number | null;
  prize_total_usd: number | null;
  is_mlh: boolean;
  event_tier: string | null;
  winners_announced: boolean;
  projects: number;
  prizes: number;
  strength: {
    teams: number;
    field_mean: number | null;
    top_field: number | null;
    elite: number;
    win_odds: number | null;
    event_rating: number | null;
    judging: number | null;
  } | null;
  rank: number | null;
  series: { slug: string; name: string; editions: { slug: string; title: string; ends_on: string | null }[] } | null;
  winners: EventWinner[];
};

export type SeriesPage = {
  slug: string;
  name: string;
  strength: { editions: number; rating: number | null; best_slug: string | null; best_title: string | null } | null;
  editions: {
    slug: string;
    title: string;
    ends_on: string | null;
    location: string | null;
    teams: number | null;
    elite: number | null;
    win_odds: number | null;
    event_rating: number | null;
  }[];
};

export type SchoolPage = {
  slug: string;
  name: string;
  country: string | null;
  members: number;
  rating: { season: string; rating: number; members_rated: number; rank: number | null } | null;
  rivals: { slug: string; name: string; rank: number; rating: number }[];
  recent_wins: {
    event_slug: string;
    event: string;
    ends_on: string | null;
    prize: string;
    person_slug: string;
    person: string;
  }[];
};

/** A page function's jsonb: an object with a slug, or null (the page 404s). */
export function asPage<T extends { slug: string }>(value: unknown): T | null {
  return typeof value === "object" && value !== null && typeof (value as { slug?: unknown }).slug === "string"
    ? (value as T)
    : null;
}
