import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Empty, Pager } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SectionHead, Win } from "@/components/os/window";
import { getDuos, PER_PAGE } from "@/lib/data";
import { num, pageParam } from "@/lib/format";

export const metadata: Metadata = {
  title: "Best duos",
  description: "Hackathon pairs who place together more often than their ratings predict.",
  alternates: { canonical: "/duos" },
};

export default function DuosPage(props: PageProps<"/duos">) {
  return (
    <>
      <SectionHead as="h1" title="Best duos">
        Pairs with three or more events together, scored on how often they place and how far they beat their ratings.
      </SectionHead>
      <Suspense fallback={<LoadingWin title="~/duos" />}>
        <Board searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Board({ searchParams }: Pick<PageProps<"/duos">, "searchParams">) {
  const page = pageParam((await searchParams).page);
  const rows = await getDuos(page);
  const more = rows.length === PER_PAGE;
  return (
    <Win
      title="~/duos"
      meta="sorted by duo score ↓"
      status={[
        "score = (placed + 1)/(events + 4) + overperformance bonus",
        <Pager key="p" page={page} last={more ? page + 1 : page} href={(p) => (p > 1 ? `/duos?page=${p}` : "/duos")} />,
      ]}
    >
      {rows.length ? (
        <ol>
          {rows.map((d) => (
            <li key={`${d.a_slug}-${d.b_slug}`} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
              <span className="numeral text-[36px]">{d.rank}</span>
              <span className="text-[18px] font-bold tracking-[-0.03em]">
                <Link href={`/h/${d.a_slug}`} className="hover:underline">
                  {d.a_name}
                </Link>{" "}
                <span className="font-normal text-muted">+</span>{" "}
                <Link href={`/h/${d.b_slug}`} className="hover:underline">
                  {d.b_name}
                </Link>
                <span className="block text-[13px] font-normal tracking-normal text-muted">
                  placed {num(d.placements)} of {num(d.events)} events together
                </span>
              </span>
              <span className="sys text-right font-semibold">{d.score != null ? d.score.toFixed(3) : "—"}</span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>No pair has three rated events together yet.</Empty>
      )}
    </Win>
  );
}
