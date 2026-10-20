import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";

import { Empty, Pager } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SectionHead, Win } from "@/components/os/window";
import { getCrews, PER_PAGE } from "@/lib/data";
import { num, pageParam } from "@/lib/format";

export const metadata: Metadata = {
  title: "Best crews",
  description: "Hackathon teams of two or more who keep hacking together and place more often than their ratings predict.",
  alternates: { canonical: "/crews" },
};

export default function CrewsPage(props: PageProps<"/crews">) {
  return (
    <>
      <SectionHead as="h1" title="Best crews">
        Two or more people who were on the same team at two or more events, scored on how often they place and how far they
        beat their ratings.
      </SectionHead>
      <Suspense fallback={<LoadingWin title="~/crews" />}>
        <Board searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Board({ searchParams }: Pick<PageProps<"/crews">, "searchParams">) {
  const page = pageParam((await searchParams).page);
  const rows = await getCrews(page);
  const more = rows.length === PER_PAGE;
  return (
    <Win
      title="~/crews"
      meta="sorted by crew score ↓"
      status={[
        "score = (placed + 1)/(events + 4) + overperformance bonus",
        <Pager key="p" page={page} last={more ? page + 1 : page} href={(p) => (p > 1 ? `/crews?page=${p}` : "/crews")} />,
      ]}
    >
      {rows.length ? (
        <ol>
          {rows.map((c) => (
            <li
              key={c.members.map((m) => m.slug).join("+")}
              className="grid grid-cols-[64px_1fr_auto] items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0"
            >
              <span className="numeral text-[36px]">{c.rank}</span>
              <span className="text-[18px] font-bold tracking-[-0.03em]">
                {c.members.map((m, i) => (
                  <Fragment key={m.slug}>
                    {i > 0 && <span className="font-normal text-muted"> + </span>}
                    <Link href={`/h/${m.slug}`} className="hover:underline">
                      {m.name}
                    </Link>
                  </Fragment>
                ))}
                <span className="block text-[13px] font-normal tracking-normal text-muted">
                  {c.size} people · placed {num(c.placements)} of {num(c.events)} events together
                </span>
              </span>
              <span className="sys text-right font-semibold">{c.score != null ? c.score.toFixed(3) : "—"}</span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>No team has two rated events together yet.</Empty>
      )}
    </Win>
  );
}
