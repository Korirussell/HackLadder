import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Loading, PageHead } from "@/components/admin/page-head";
import { requireAdmin } from "@/lib/admin";
import { input, label } from "@/lib/ui";

import { saveHackathonSetting } from "../actions";

const PAGE_SIZE = 50;
const FILTERS = { all: "All", rated: "Counting", unrated: "Not counting", custom: "Set by an admin" } as const;
type Filter = keyof typeof FILTERS;

export default function EventsAdmin({ searchParams }: PageProps<"/admin/events">) {
  return (
    <>
      <PageHead title="Events">
        By default only in-person MLH member events count. Include any other event, or exclude one. Event tiers are labels:
        how much a win is worth always comes from who was there.
      </PageHead>
      <Suspense fallback={<Loading />}>
        <EventList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function EventList({ searchParams }: Pick<PageProps<"/admin/events">, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const filter: Filter = typeof params.show === "string" && params.show in FILTERS ? (params.show as Filter) : "all";
  const page = Math.max(1, Number(params.page) || 1);

  const { supabase } = await requireAdmin("/admin/events");
  let query = supabase
    .from("hackathon_scope")
    .select("*", { count: "exact" })
    .order("ends_on", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`title.ilike.%${q.replaceAll(/[%,()]/g, " ")}%,slug.ilike.%${q.replaceAll(/[%,()]/g, " ")}%`);
  if (filter === "rated") query = query.eq("is_rated", true);
  if (filter === "unrated") query = query.eq("is_rated", false);
  if (filter === "custom") query = query.neq("counts", "auto");

  const [{ data: events, count, error }, { data: tiers }] = await Promise.all([
    query,
    supabase.from("event_tiers").select("code, label").order("position"),
  ]);
  if (error) throw new Error(`Couldn't load events: ${error.message}`);

  const href = (patch: Record<string, string | number>) =>
    `/admin/events?${new URLSearchParams({ q, show: filter, page: String(page), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <form className="flex flex-wrap items-end gap-4" role="search">
        <div className="min-w-[260px] flex-1">
          <label htmlFor="q" className={label}>
            Search events
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="TreeHacks, hackmit-2025" className={`${input} mt-1`} />
        </div>
        <input type="hidden" name="show" value={filter} />
        <button type="submit" className="rounded-button bg-ink px-5 py-2.5 font-bold text-paper">
          Search
        </button>
      </form>
      <nav aria-label="Filter" className="mt-5 flex flex-wrap gap-5 text-[15px]">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link key={f} href={href({ show: f, page: 1 })} aria-current={f === filter ? "page" : undefined}
            className={f === filter ? "font-bold underline underline-offset-4" : "text-graphite hover:text-ink"}>
            {FILTERS[f]}
          </Link>
        ))}
      </nav>

      {!events?.length ? (
        <p className="mt-12 max-w-[60ch]">
          {q || filter !== "all"
            ? `No events match${q ? ` "${q}"` : ""}. Try the event's name or its Devpost subdomain.`
            : "No events loaded yet. They appear here after the first crawl."}
        </p>
      ) : (
        <ul className="mt-8 border-t border-rule">
          {events.map((e) => (
            <li key={e.hackathon_id} className="grid gap-4 border-b border-rule py-6 min-[900px]:grid-cols-[1fr_1.4fr]">
              <div>
                <p className="text-[22px] leading-tight font-bold tracking-[-0.02em]">{e.title}</p>
                <p className="mt-1 text-[14px] text-graphite">
                  {e.slug} · {e.ends_on ?? "no date"} · {e.is_mlh ? "MLH" : "not MLH"}
                  {e.is_online ? " · online" : ""}
                </p>
                <p className="mt-2 text-[15px]">
                  <b>{e.is_rated ? "Counts" : "Doesn't count"}</b>
                  <span className="text-graphite">: {e.reason}</span>
                </p>
              </div>
              <ActionForm action={saveHackathonSetting} submitLabel="Save" className="grid gap-3 min-[600px]:grid-cols-3">
                <input type="hidden" name="hackathon_id" value={e.hackathon_id ?? ""} />
                <div>
                  <label className={label} htmlFor={`counts-${e.hackathon_id}`}>Counts</label>
                  <select id={`counts-${e.hackathon_id}`} name="counts" defaultValue={e.counts ?? "auto"} className={`${input} mt-1`}>
                    <option value="auto">Auto (MLH in person)</option>
                    <option value="include">Include</option>
                    <option value="exclude">Exclude</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor={`tier-${e.hackathon_id}`}>Event tier</label>
                  <select id={`tier-${e.hackathon_id}`} name="event_tier" defaultValue={e.event_tier ?? ""} className={`${input} mt-1`}>
                    <option value="">None</option>
                    {tiers?.map((t) => (
                      <option key={t.code} value={t.code}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor={`note-${e.hackathon_id}`}>Note</label>
                  <input id={`note-${e.hackathon_id}`} name="note" defaultValue={e.note ?? ""} placeholder="Why" className={`${input} mt-1`} />
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}

      {(count ?? 0) > PAGE_SIZE && (
        <nav aria-label="Pages" className="mt-8 flex gap-6 font-bold">
          {page > 1 && <Link href={href({ page: page - 1 })}>Newer</Link>}
          {page * PAGE_SIZE < (count ?? 0) && <Link href={href({ page: page + 1 })}>Older</Link>}
          <span className="font-normal text-graphite">
            Page {page} of {Math.ceil((count ?? 0) / PAGE_SIZE)}
          </span>
        </nav>
      )}
    </>
  );
}
