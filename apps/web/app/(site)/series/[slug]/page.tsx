import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Empty, PageTitle } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { Chip, Win } from "@/components/os/window";
import { getSeries, getSeriesBoard } from "@/lib/data";
import { isoDate, num, odds, plural } from "@/lib/format";

export async function generateStaticParams() {
  const top = await getSeriesBoard(20);
  return top.length ? top.map((s) => ({ slug: s.slug })) : [{ slug: "_" }];
}

export async function generateMetadata({ params }: PageProps<"/series/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = await getSeries(slug);
  if (!s) return { title: "Not found", robots: { index: false } };
  return {
    title: `${s.name} (series)`,
    description: `Every edition of ${s.name}, and how hard each was to win.`,
    alternates: { canonical: `/series/${s.slug}` },
  };
}

export default function SeriesProfile(props: PageProps<"/series/[slug]">) {
  return (
    <Suspense fallback={<LoadingWin title="editions" />}>
      <Series params={props.params} />
    </Suspense>
  );
}

async function Series({ params }: Pick<PageProps<"/series/[slug]">, "params">) {
  const { slug } = await params;
  const s = await getSeries(slug);
  if (!s) notFound();
  const rated = s.editions.filter((e) => e.event_rating != null);
  const max = Math.max(...rated.map((e) => e.event_rating ?? 0), 0.01);
  const min = Math.min(...rated.map((e) => e.event_rating ?? 0), 0);

  return (
    <>
      <PageTitle
        chips={
          <>
            <Chip accent>{plural(s.editions.length, "edition")}</Chip>
            {s.strength?.rating != null && <Chip>series rating {s.strength.rating.toFixed(2)}</Chip>}
            {s.strength?.best_slug && <Chip>hardest: {s.strength.best_title}</Chip>}
          </>
        }
      >
        {s.name}
      </PageTitle>
      <Win title="editions" meta="newest first" status={["event rating: 70% elite count, 30% win odds", `${num(rated.length)} rated`]}>
        {s.editions.length ? (
          s.editions.map((e) => (
            <div
              key={e.slug}
              className="grid grid-cols-[1fr_140px_auto] items-center gap-4 border-b border-line px-3.5 py-3 last:border-b-0 max-[980px]:grid-cols-[1fr_auto]"
            >
              <span>
                <Link href={`/e/${e.slug}`} className="text-[17px] font-bold tracking-[-0.03em] hover:underline">
                  {e.title}
                </Link>
                <span className="block text-[13px] text-muted">
                  {[isoDate(e.ends_on), e.location, e.teams != null && plural(e.teams, "team"), e.elite != null && `${num(e.elite)} elite`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="h-1.5 rounded-[3px] bg-chrome max-[980px]:hidden" aria-hidden="true">
                {e.event_rating != null && (
                  <i className="block h-full rounded-[3px] bg-ink" style={{ width: `${Math.max(4, (100 * (e.event_rating - min)) / (max - min || 1))}%` }} />
                )}
              </span>
              <span className="sys text-right font-semibold">{odds(e.win_odds)}</span>
            </div>
          ))
        ) : (
          <Empty>No editions on record.</Empty>
        )}
      </Win>
    </>
  );
}
