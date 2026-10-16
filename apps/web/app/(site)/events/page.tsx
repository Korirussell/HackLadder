import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PlayerCard } from "@/components/site/boards";
import { Empty, Pager } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SectionHead, Win } from "@/components/os/window";
import { type EventFilters, getEventBoard, getSeriesBoard, PER_PAGE } from "@/lib/data";
import { isoDate, num, odds, pageParam, pages, plural } from "@/lib/format";

export const metadata: Metadata = {
  title: "Hardest to win",
  description: "Hackathons ranked by how hard they are to win: the odds a strong team takes first against the field that showed up.",
  alternates: { canonical: "/events" },
};

export default function EventsPage(props: PageProps<"/events">) {
  return (
    <>
      <SectionHead as="h1" title="Hardest to win">
        Odds that a team of 90th-percentile hackers takes first against the field that showed up.
      </SectionHead>
      <Suspense fallback={<LoadingWin title="~/events" height={600} />}>
        <Board searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const SIZES = [
  { value: "", label: "any size" },
  { value: "50", label: "50+ teams" },
  { value: "100", label: "100+ teams" },
  { value: "200", label: "200+ teams" },
];

async function Board({ searchParams }: Pick<PageProps<"/events">, "searchParams">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = str("view") === "series" ? "series" : "events";
  const year = Number.parseInt(str("year"), 10);
  const filters: EventFilters = {
    ...(year >= 2009 && year <= 2100 ? { year } : {}),
    ...(str("format") === "online" ? { online: true } : str("format") === "in-person" ? { online: false } : {}),
    ...(Number(str("size")) > 0 ? { minTeams: Number(str("size")) } : {}),
  };
  const page = pageParam(sp.page);

  const tabs = (
    <div className="sys mb-4 flex flex-wrap items-center gap-2">
      {(["events", "series"] as const).map((v) => (
        <Link
          key={v}
          href={v === "series" ? "/events?view=series" : "/events"}
          aria-current={view === v ? "page" : undefined}
          className="rounded-md border border-line bg-win px-2.5 py-1 hover:border-ink aria-[current=page]:border-select aria-[current=page]:bg-select aria-[current=page]:text-select-ink"
        >
          {v}
        </Link>
      ))}
      <Link href="/upcoming" className="ml-auto text-muted hover:text-ink">
        upcoming events
      </Link>
    </div>
  );

  if (view === "series") {
    const series = await getSeriesBoard(100);
    return (
      <>
        {tabs}
        <Win title="~/series" meta="sorted by series rating ↓" status={[plural(series.length, "series", "series")]}>
          {series.length ? (
            <ol>
              {series.map((s) => (
                <li key={s.slug} className="grid grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
                  <span className="numeral text-[32px]">{s.rank}</span>
                  <span className="min-w-0">
                    <Link href={`/series/${s.slug}`} className="text-[18px] font-bold tracking-[-0.03em] hover:underline">
                      {s.name}
                    </Link>
                    <span className="block truncate text-[13px] text-muted">
                      {plural(s.editions, "edition")}
                      {s.best_title ? ` · hardest: ${s.best_title}` : ""}
                    </span>
                  </span>
                  <span className="sys text-[14px] font-semibold">{s.rating != null ? s.rating.toFixed(2) : "—"}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Series appear once two or more editions of an event are rated.</Empty>
          )}
        </Win>
      </>
    );
  }

  const rows = await getEventBoard(page, filters, PER_PAGE);
  const total = rows[0]?.total ?? 0;
  const last = pages(total, PER_PAGE);
  const query = (p: number) =>
    `/events?${new URLSearchParams({
      ...(str("year") ? { year: str("year") } : {}),
      ...(str("format") ? { format: str("format") } : {}),
      ...(str("size") ? { size: str("size") } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    })}`;
  const [featured, ...rest] = page === 1 ? rows.slice(0, 3) : [];
  const listed = page === 1 ? rows.slice(3) : rows;

  return (
    <>
      {tabs}
      <form action="/events" className="sys mb-6 flex flex-wrap items-center gap-2 text-muted">
        <label className="sr-only" htmlFor="year">year</label>
        <input id="year" name="year" inputMode="numeric" placeholder="year" defaultValue={str("year")} className="w-20 rounded-md border border-line bg-win px-2 py-1 text-ink" />
        <label className="sr-only" htmlFor="format">format</label>
        <select id="format" name="format" defaultValue={str("format")} className="rounded-md border border-line bg-win px-2 py-1 text-ink">
          <option value="">in person or online</option>
          <option value="in-person">in person</option>
          <option value="online">online</option>
        </select>
        <label className="sr-only" htmlFor="size">size</label>
        <select id="size" name="size" defaultValue={str("size")} className="rounded-md border border-line bg-win px-2 py-1 text-ink">
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-line bg-win px-2.5 py-1 text-ink hover:border-ink">
          filter
        </button>
        {(str("year") || str("format") || str("size")) && (
          <Link href="/events" className="hover:text-ink">
            clear
          </Link>
        )}
      </form>

      {featured && (
        <div className="mb-6 grid grid-cols-3 gap-5 max-[980px]:grid-cols-1">
          {[featured, ...rest].map((e, i) => (
            <PlayerCard key={e.slug} e={e} featured={i === 0} />
          ))}
        </div>
      )}

      <Win title="~/events" meta="sorted by event rating ↓" status={[`${num(total)} rated events`, <Pager key="p" page={Math.min(page, last)} last={last} href={query} />]}>
        {listed.length ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className="sys text-left text-[11px] text-muted [&>th]:border-b [&>th]:border-line [&>th]:px-3.5 [&>th]:py-2 [&>th]:font-medium">
                <th scope="col">rank</th>
                <th scope="col">event</th>
                <th scope="col" className="max-[980px]:hidden">teams · elite</th>
                <th scope="col" className="text-right">odds</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((e) => (
                <tr key={e.slug} className="border-b border-line last:border-b-0">
                  <td className="numeral w-16 px-3.5 py-3 text-[32px]">{e.rank}</td>
                  <td className="px-3.5 py-3">
                    <Link href={`/e/${e.slug}`} className="text-[17px] font-bold tracking-[-0.03em] hover:underline">
                      {e.title}
                    </Link>
                    <div className="text-[13px] text-muted">
                      {[e.is_online ? "Online" : e.location, isoDate(e.ends_on), e.event_tier && `${e.event_tier} tier`].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="sys px-3.5 py-3 text-muted max-[980px]:hidden">
                    {num(e.teams)} · {num(e.elite)}
                  </td>
                  <td className="sys px-3.5 py-3 text-right font-semibold whitespace-nowrap">{odds(e.win_odds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : rows.length ? null : (
          <Empty>
            {Object.keys(filters).length
              ? "No rated events match those filters. Try a wider size or another year."
              : "No events are rated yet. Event odds appear once results are crawled and rated."}
          </Empty>
        )}
      </Win>
    </>
  );
}
