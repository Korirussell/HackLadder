import Link from "next/link";

import { SearchHoldingWindow } from "@/components/site/search-window";
import { BarList, LadderTable, PlayerCard } from "@/components/site/boards";
import { Button, Change, Empty } from "@/components/site/bits";
import { SectionHead, Win } from "@/components/os/window";
import { getCurrentSeason, getEventBoard, getLadder, getSchoolBoard, getSiteStats, PER_PAGE } from "@/lib/data";
import { num, pages, plural } from "@/lib/format";

// The homepage is the reference, section for section (§10): hero search, top of the ladder,
// school top 10, hardest 3 events, and the claim CTA. Every read is cached, so it's static.
export default async function Home() {
  const [stats, top, schools, hardest, season] = await Promise.all([
    getSiteStats(),
    getLadder(1, null, 5),
    getSchoolBoard(),
    getEventBoard(1, {}, 3),
    getCurrentSeason(),
  ]);
  const total = top[0]?.total ?? 0;

  return (
    <>
      <section className="relative grid min-h-[calc(100vh-var(--spacing-menu)-28px)] content-center pb-10 max-[980px]:min-h-0 max-[980px]:pt-5">
        <div
          aria-hidden="true"
          className="absolute top-[8%] right-[6%] z-[3] grid size-[132px] rotate-[-12deg] place-items-center rounded-full bg-accent text-center text-[15px] leading-[1.05] font-extrabold tracking-[-0.01em] text-accent-ink shadow-[0_10px_24px_-10px_rgba(0,0,0,.4)] max-[980px]:top-10 max-[980px]:right-0 max-[980px]:size-[84px] max-[980px]:text-[11px]"
        >
          <div>
            Season
            <br />
            {season.start}
          </div>
        </div>
        <h1 className="display relative z-[1] text-hero max-[980px]:text-[16vw]">
          Every hacker
          <br />
          who&apos;s won,
          <br />
          ranked.
        </h1>
        <div className="mt-10 grid grid-cols-[minmax(0,560px)_minmax(0,1fr)] items-start gap-7 max-[980px]:grid-cols-1">
          <SearchHoldingWindow
            meta={`${num(stats.hackers)} indexed`}
            status={[
              top[0] ? `Try: ${top[0].display_name.toLowerCase()}` : "Try your Devpost username",
              `Ratings from ${plural(stats.rated_events, "hackathon")}`,
            ]}
          />
          <Win title="top_3" meta="live">
            {top.length ? (
              <ol>
                {top.slice(0, 3).map((r) => (
                  <li key={r.slug} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
                    <span className="stat text-[28px]">{r.rank}</span>
                    <span className="min-w-0">
                      <Link href={`/h/${r.slug}`} className="font-bold tracking-[-0.02em] hover:underline">
                        {r.display_name}
                      </Link>
                      <small className="block truncate text-[12.5px] text-muted">{r.school_name ?? plural(r.events, "event")}</small>
                    </span>
                    <span className="sys text-right text-[14px] font-semibold">
                      {num(r.score)}
                      <small className="block text-[12.5px]">
                        <Change value={r.month_change} />
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>The first ratings publish after the opening crawl. Search for your event in the meantime.</Empty>
            )}
          </Win>
        </div>
        {hardest.length > 0 && (
          <div className="sys mt-[22px] flex flex-wrap gap-x-[22px] gap-y-2 text-muted">
            <span>rated from:</span>
            {hardest.map((e) => (
              <Link key={e.slug} href={`/e/${e.slug}`} className="hover:text-ink">
                {e.title}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-[120px]">
        <SectionHead title="The ladder">Top hackers with three or more rated events. Updated every Monday.</SectionHead>
        <Win
          title="~/ladder"
          meta="sorted by rating ↓"
          status={[
            total ? `1 of ${num(total)} selected` : "0 selected",
            <Link key="all" href="/hackers" className="hover:text-ink">
              page 1 / {num(pages(total, PER_PAGE))} · open the full ladder
            </Link>,
          ]}
        >
          {top.length ? (
            <LadderTable rows={top} />
          ) : (
            <Empty>Nobody has three rated events yet. The ladder fills in as events are crawled and rated.</Empty>
          )}
        </Win>
      </section>

      <section className="mt-[120px]">
        <SectionHead title="School vs school">Average rating of each school&apos;s top 10 hackers this season.</SectionHead>
        {schools.length ? (
          <div className="grid grid-cols-2 gap-6 max-[980px]:grid-cols-1">
            <Win title="schools 1–5">
              <BarList rows={schools.slice(0, 5)} max={schools[0].rating} />
            </Win>
            {schools.length > 5 && (
              <Win title="schools 6–10">
                <BarList rows={schools.slice(5, 10)} max={schools[0].rating} />
              </Win>
            )}
          </div>
        ) : (
          <Win title="schools">
            <Empty action={<Button href="/claim">Claim your profile</Button>}>
              Schools come from claimed profiles, and a school appears once five of its hackers are rated. Claim yours and
              add your school to put it on the board.
            </Empty>
          </Win>
        )}
      </section>

      <section className="mt-[120px]">
        <SectionHead title="Hardest to win">
          Odds that a team of 90th-percentile hackers takes first against the field that showed up.
        </SectionHead>
        {hardest.length ? (
          <div className="grid grid-cols-3 gap-5 max-[980px]:grid-cols-1">
            {hardest.map((e, i) => (
              <PlayerCard key={e.slug} e={e} featured={i === 0} />
            ))}
          </div>
        ) : (
          <Win title="events">
            <Empty action={<Button href="/events">Browse events</Button>}>
              Event odds appear once an event&apos;s results are crawled and rated.
            </Empty>
          </Win>
        )}
      </section>

      <section className="mt-[140px] text-center">
        <h2 className="display text-closing">
          You&apos;re probably
          <br />
          already on here.
        </h2>
        <Link href="/claim" className="mt-[30px] inline-flex rounded-button bg-ink px-[22px] py-3.5 text-[17px] font-bold text-bg hover:opacity-90">
          Claim your profile
        </Link>
      </section>
    </>
  );
}
