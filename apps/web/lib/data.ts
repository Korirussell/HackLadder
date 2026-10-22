import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { asPage, type EventPage, type HackerPage, type SchoolPage, type SeriesPage } from "./pages";
import type { SearchHit } from "./search";
import { seasonOf } from "./season";
import { publicClient } from "./supabase/public";

// Every public read, cached and shared by all visitors. Ratings change when the pipeline
// publishes (weekly, plus nightly corrections), which revalidates the "ratings" tag through
// /api/revalidate; the hourly lifetime is the fallback if that webhook isn't set up.

export const PER_PAGE = 50;

async function rpc<T>(name: string, args: Record<string, unknown>, empty: T): Promise<T> {
  const supabase = publicClient();
  if (!supabase) return empty;
  // The page functions all share one calling convention; their results are typed by the callers.
  const { data, error } = await (supabase.rpc as (n: string, a: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>)(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return (data ?? empty) as T;
}

export type SiteStats = {
  hackers: number;
  rated_hackers: number;
  hackathons: number;
  rated_events: number;
  updated_at: string | null;
};

export async function getSiteStats(): Promise<SiteStats> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  const rows = await rpc<SiteStats[]>("site_stats", {}, []);
  return rows[0] ?? { hackers: 0, rated_hackers: 0, hackathons: 0, rated_events: 0, updated_at: null };
}

/** The current Aug-Jul season, for the sticker and season labels. */
export async function getCurrentSeason(): Promise<{ start: number; name: string }> {
  "use cache";
  cacheLife("days");
  return seasonOf(new Date());
}

export type NextEvent ={ name: string; starts_at: string; ends_at: string; location: string | null; website_url: string | null };

export async function getNextEvent(): Promise<NextEvent | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("events");
  const rows = await rpc<NextEvent[]>("next_event", {}, []);
  return rows[0] ?? null;
}

export type UpcomingEvent = NextEvent & { format: string };

export async function getUpcomingEvents(): Promise<UpcomingEvent[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("events");
  return rpc<UpcomingEvent[]>("upcoming_events", { p_limit: 120 }, []);
}

export type LadderRow = {
  rank: number;
  total: number;
  slug: string;
  display_name: string;
  school_name: string | null;
  school_slug: string | null;
  score: number;
  events: number;
  placements: number;
  month_change: number;
  tier: string | null;
  is_claimed: boolean;
  best_event_slug: string | null;
  best_event_title: string | null;
  best_prize: string | null;
};

export async function getLadder(page = 1, school: string | null = null, perPage = PER_PAGE): Promise<LadderRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return rpc<LadderRow[]>(
    "ladder",
    { p_limit: perPage, p_offset: (page - 1) * perPage, ...(school ? { p_school: school } : {}) },
    [],
  );
}

export async function getProvisionalCount(): Promise<number> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return Number(await rpc<number>("provisional_count", {}, 0));
}

export async function getHacker(slug: string): Promise<HackerPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings", `hacker:${slug}`);
  return asPage<HackerPage>(await rpc<unknown>("hacker_page", { p_slug: slug }, null));
}

export type EventBoardRow = {
  rank: number;
  total: number;
  slug: string;
  title: string;
  location: string | null;
  is_online: boolean;
  ends_on: string | null;
  teams: number;
  elite: number;
  win_odds: number | null;
  event_rating: number | null;
  event_tier: string | null;
  series_slug: string | null;
};

export type EventFilters = { year?: number; online?: boolean; minTeams?: number };

export async function getEventBoard(page = 1, filters: EventFilters = {}, perPage = PER_PAGE): Promise<EventBoardRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return rpc<EventBoardRow[]>(
    "event_board",
    {
      p_limit: perPage,
      p_offset: (page - 1) * perPage,
      ...(filters.year ? { p_year: filters.year } : {}),
      ...(filters.online !== undefined ? { p_online: filters.online } : {}),
      ...(filters.minTeams ? { p_min_teams: filters.minTeams } : {}),
    },
    [],
  );
}

export type SeriesBoardRow = {
  rank: number;
  slug: string;
  name: string;
  editions: number;
  rating: number | null;
  best_slug: string | null;
  best_title: string | null;
};

export async function getSeriesBoard(limit = 50): Promise<SeriesBoardRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return rpc<SeriesBoardRow[]>("series_board", { p_limit: limit }, []);
}

export async function getEvent(slug: string): Promise<EventPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings", `event:${slug}`);
  return asPage<EventPage>(await rpc<unknown>("event_page", { p_slug: slug }, null));
}

export async function getSeries(slug: string): Promise<SeriesPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return asPage<SeriesPage>(await rpc<unknown>("series_page", { p_slug: slug }, null));
}

export type SchoolRow = { rank: number; slug: string; name: string; rating: number; members: number; season: string };

export async function getSchoolBoard(season: string | null = null): Promise<SchoolRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return rpc<SchoolRow[]>("school_board", season ? { p_season: season } : {}, []);
}

export async function getSchoolSeasons(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return rpc<string[]>("school_seasons", {}, []);
}

export async function getSchool(slug: string): Promise<SchoolPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return asPage<SchoolPage>(await rpc<unknown>("school_page", { p_slug: slug }, null));
}

export type CrewRow = {
  rank: number;
  members: { slug: string; name: string }[];
  size: number;
  events: number;
  placements: number;
  overperformance: number | null;
  score: number | null;
};

export async function getCrews(page = 1, perPage = PER_PAGE): Promise<CrewRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return rpc<CrewRow[]>("crew_board", { p_limit: perPage, p_offset: (page - 1) * perPage }, []);
}

export type RankTier = { name: string; top_percent: number | null; top_n: number | null; position: number };

export async function getRankTiers(): Promise<RankTier[]> {
  "use cache";
  cacheLife("days");
  cacheTag("config");
  const supabase = publicClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("public_rank_tiers").select("*").order("position");
  if (error) throw new Error(`rank tiers: ${error.message}`);
  return (data ?? []).map((t) => ({
    name: t.name ?? "",
    top_percent: t.top_percent,
    top_n: t.top_n,
    position: t.position ?? 0,
  }));
}

export async function searchAll(q: string): Promise<SearchHit[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return rpc<SearchHit[]>("search", { q, lim: 30 }, []);
}

export type SitemapEntry ={ kind: "hacker" | "school" | "event" | "series"; slug: string; updated_at: string | null };

export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("ratings");
  return rpc<SitemapEntry[]>("sitemap_entries", {}, []);
}

export async function getSchoolOptions(): Promise<{ id: number; slug: string; name: string }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("schools");
  const supabase = publicClient();
  if (!supabase) return [];
  // Only schools someone is in: the full list (~10k) is searched on /me, never listed.
  const { data, error } = await supabase.rpc("school_options");
  if (error) throw new Error(`schools: ${error.message}`);
  return (data ?? []).flatMap((s) => (s.id && s.slug && s.name ? [{ id: s.id, slug: s.slug, name: s.name }] : []));
}
