import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Loading, PageHead } from "@/components/admin/page-head";
import { requireAdmin } from "@/lib/admin";
import { ghostButton, input, label } from "@/lib/ui";

import { confirmMlhMatch, rejectMlhMatch } from "../actions";

const PAGE_SIZE = 40;
const FILTERS = {
  review: "Needs review",
  auto: "Matched automatically",
  confirmed: "Confirmed",
  rejected: "No Devpost event",
  all: "All",
} as const;
type Filter = keyof typeof FILTERS;

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

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

  const { supabase } = await requireAdmin("/admin/mlh");
  let query = supabase
    .from("mlh_match_review")
    .select("*", { count: "exact" })
    .order("ends_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filter === "review") query = query.in("status", ["suggested", "unmatched"]);
  else if (filter !== "all") query = query.eq("status", filter);
  if (q) query = query.ilike("mlh_name", `%${q.replaceAll(/[%_]/g, " ")}%`);
  const { data: rows, count, error } = await query;
  if (error) throw new Error(`Couldn't load MLH events: ${error.message}`);

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
          </Link>
        ))}
      </nav>

      {!rows?.length ? (
        <p className="mt-12 max-w-[60ch]">
          {filter === "review" && !q
            ? "Nothing to review. Run `hl mlh crawl` and `hl mlh match` after new events are crawled."
            : "No MLH events match."}
        </p>
      ) : (
        <ul className="mt-8 border-t border-rule">
          {rows.map((r) => (
            <li key={r.mlh_event_id} className="grid gap-4 border-b border-rule py-6 min-[900px]:grid-cols-[1fr_1.3fr]">
              <div>
                <p className="text-[22px] leading-tight font-bold tracking-[-0.02em]">{r.mlh_name}</p>
                <p className="mt-1 text-[14px] text-graphite">
                  MLH season {r.season} · {fmt(r.starts_at)} to {fmt(r.ends_at)} · {r.format}
                  {r.location ? ` · ${r.location}` : ""}
                  {r.is_high_school ? " · high school" : ""}
                </p>
                {r.website_url && (
                  <a href={r.website_url} className="text-[14px] underline underline-offset-2" rel="noreferrer" target="_blank">
                    {r.website_url}
                  </a>
                )}
              </div>
              <div>
                <p className="text-[15px]">
                  {r.hackathon_id ? (
                    <>
                      <b>{r.hackathon_title}</b> <span className="text-graphite">({r.hackathon_slug}, deadline {r.hackathon_ends_on})</span>
                    </>
                  ) : (
                    <b>No Devpost match</b>
                  )}
                  <span className="text-graphite"> · {r.status}{r.note ? `: ${r.note}` : ""}</span>
                </p>
                <ActionForm action={confirmMlhMatch} submitLabel={r.hackathon_id ? "Confirm" : "Match"} className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="mlh_event_id" value={r.mlh_event_id ?? ""} />
                  <input type="hidden" name="hackathon_id" value={r.hackathon_id ?? ""} />
                  <div className="min-w-[220px] flex-1">
                    <label className={label} htmlFor={`slug-${r.mlh_event_id}`}>
                      {r.hackathon_id ? "Or a different Devpost subdomain" : "Devpost subdomain"}
                    </label>
                    <input id={`slug-${r.mlh_event_id}`} name="slug" placeholder="hackgt-11" className={`${input} mt-1`} />
                  </div>
                </ActionForm>
                <form action={rejectMlhMatch} className="mt-2">
                  <input type="hidden" name="mlh_event_id" value={r.mlh_event_id ?? ""} />
                  <button type="submit" className={ghostButton}>No Devpost event</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(count ?? 0) > PAGE_SIZE && (
        <nav aria-label="Pages" className="mt-8 flex gap-6 font-bold">
          {page > 1 && <Link href={href({ page: page - 1 })}>Newer</Link>}
          {page * PAGE_SIZE < (count ?? 0) && <Link href={href({ page: page + 1 })}>Older</Link>}
          <span className="font-normal text-graphite">Page {page} of {Math.ceil((count ?? 0) / PAGE_SIZE)}</span>
        </nav>
      )}
    </>
  );
}
