import Link from "next/link";
import { Suspense } from "react";

import { Loading, PageHead } from "@/components/admin/page-head";
import { requireAdmin } from "@/lib/admin";
import { isLikelyRight, type ReviewRow, toReviewRow } from "@/lib/mlh-review";
import { input, label } from "@/lib/ui";

import { ReviewQueue } from "./review-queue";

const PAGE_SIZE = 100;
const OPEN = ["suggested", "unmatched"];
const FILTERS = {
  review: "Needs review",
  upcoming: "Upcoming",
  auto: "Matched automatically",
  confirmed: "Confirmed",
  rejected: "No Devpost event",
  all: "All",
} as const;
type Filter = keyof typeof FILTERS;

export default function MlhAdmin({ searchParams }: PageProps<"/admin/mlh">) {
  return (
    <>
      <PageHead title="MLH events">
        MLH member events count by default, but MLH rarely links to Devpost, so each one is matched by name and dates.
        Confirm or fix the uncertain ones.
      </PageHead>
      <Suspense fallback={<Loading />}>
        <MlhList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MlhList({ searchParams }: Pick<PageProps<"/admin/mlh">, "searchParams">) {
  const params = await searchParams;
  const filter: Filter = typeof params.show === "string" && params.show in FILTERS ? (params.show as Filter) : "review";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);
  const now = new Date().toISOString();

  const { supabase } = await requireAdmin("/admin/mlh");
  const view = () => supabase.from("mlh_match_review");
  // The review and upcoming queues load whole (a few hundred rows) so they can be worked through
  // without paging; the other lists page.
  const whole = filter === "review" || filter === "upcoming";
  let query = view().select("*", { count: "exact" });
  if (filter === "review") query = query.in("status", OPEN).lte("ends_at", now).order("ends_at", { ascending: false });
  else if (filter === "upcoming") query = query.in("status", OPEN).gt("ends_at", now).order("ends_at");
  else {
    if (filter !== "all") query = query.eq("status", filter);
    query = query.order("ends_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  }
  if (whole) query = query.limit(1000); // PostgREST's max rows; the queues are a few hundred
  if (q) query = query.ilike("mlh_name", `%${q.replaceAll(/[%_\\]/g, " ")}%`);

  const [{ data, count, error }, reviewCount, upcomingCount] = await Promise.all([
    query,
    view().select("mlh_event_id", { count: "exact", head: true }).in("status", OPEN).lte("ends_at", now),
    view().select("mlh_event_id", { count: "exact", head: true }).in("status", OPEN).gt("ends_at", now),
  ]);
  if (error) throw new Error(`Couldn't load MLH events: ${error.message}`);
  const rows = (data ?? []).map((r) => toReviewRow(r)).filter((r): r is ReviewRow => r !== null);
  const likely = filter === "review" ? rows.filter(isLikelyRight) : [];
  const rest = filter === "review" ? rows.filter((r) => !isLikelyRight(r)) : rows;
  const counts: Partial<Record<Filter, number | null>> = { review: reviewCount.count, upcoming: upcomingCount.count };

  const href = (patch: Record<string, string | number>) =>
    `/admin/mlh?${new URLSearchParams({ show: filter, q, page: String(page), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <form className="flex flex-wrap items-end gap-4" role="search">
        <div className="min-w-[260px] flex-1">
          <label htmlFor="q" className={label}>Search MLH events</label>
          <input id="q" name="q" defaultValue={q} placeholder="HackGT" className={`${input} mt-1`} />
        </div>
        <input type="hidden" name="show" value={filter} />
        <button type="submit" className="rounded-button bg-ink px-5 py-2.5 font-bold text-paper">Search</button>
      </form>
      <nav aria-label="Filter" className="mt-5 flex flex-wrap gap-5 text-[15px]">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link key={f} href={href({ show: f, page: 1 })} aria-current={f === filter ? "page" : undefined}
            className={f === filter ? "font-bold underline underline-offset-4" : "text-graphite hover:text-ink"}>
            {FILTERS[f]}
            {typeof counts[f] === "number" ? ` (${counts[f]})` : ""}
          </Link>
        ))}
      </nav>
      {filter === "upcoming" && (
        <p className="mt-4 max-w-[70ch] text-[15px] text-graphite">
          These haven&apos;t happened yet, so their Devpost pages may not exist. Leave them: `hl mlh match` re-checks
          every undecided event after each crawl.
        </p>
      )}

      {!rows.length ? (
        <p className="mt-12 max-w-[60ch]">
          {filter === "review" && !q
            ? "Nothing to review. Run `hl mlh crawl` and `hl mlh match` after new events are crawled."
            : "No MLH events match."}
        </p>
      ) : (
        <ReviewQueue key={`${filter}:${q}:${page}`} likely={likely} rest={rest} restTitle={filter === "review" ? "Needs a look" : FILTERS[filter]} />
      )}

      {!whole && (count ?? 0) > PAGE_SIZE && (
        <nav aria-label="Pages" className="mt-8 flex gap-6 font-bold">
          {page > 1 && <Link href={href({ page: page - 1 })}>Newer</Link>}
          {page * PAGE_SIZE < (count ?? 0) && <Link href={href({ page: page + 1 })}>Older</Link>}
          <span className="font-normal text-graphite">Page {page} of {Math.ceil((count ?? 0) / PAGE_SIZE)}</span>
        </nav>
      )}
    </>
  );
}
