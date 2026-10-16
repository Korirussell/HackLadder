import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BarList } from "@/components/site/boards";
import { Button, Empty } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SectionHead, Win } from "@/components/os/window";
import { getSchoolBoard, getSchoolSeasons } from "@/lib/data";
import { plural } from "@/lib/format";

export const metadata: Metadata = {
  title: "School vs school",
  description: "Schools ranked by the average rating of their top 10 hackers this season.",
  alternates: { canonical: "/schools" },
};

export default function SchoolsPage(props: PageProps<"/schools">) {
  return (
    <>
      <SectionHead as="h1" title="School vs school">
        Average rating of each school&apos;s top 10 hackers who were active that season (August to July).
      </SectionHead>
      <Suspense fallback={<LoadingWin title="~/schools" />}>
        <Board searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Board({ searchParams }: Pick<PageProps<"/schools">, "searchParams">) {
  const sp = await searchParams;
  const seasons = await getSchoolSeasons();
  const season = typeof sp.season === "string" && seasons.includes(sp.season) ? sp.season : (seasons[0] ?? null);
  const rows = await getSchoolBoard(season);
  return (
    <>
      {seasons.length > 1 && (
        <nav aria-label="Seasons" className="sys mb-4 flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s}
              href={`/schools?season=${s}`}
              aria-current={s === season ? "page" : undefined}
              className="rounded-md border border-line bg-win px-2.5 py-1 hover:border-ink aria-[current=page]:border-select aria-[current=page]:bg-select aria-[current=page]:text-select-ink"
            >
              {s}
            </Link>
          ))}
        </nav>
      )}
      <Win title={season ? `~/schools/${season}` : "~/schools"} meta="top-10 average ↓" status={[plural(rows.length, "school"), "a school needs 5 rated hackers"]}>
        {rows.length ? (
          <BarList rows={rows} max={rows[0].rating} />
        ) : (
          <Empty action={<Button href="/claim">Claim your profile</Button>}>
            Schools come only from hackers who claim their profile and add their school, and a school appears once five of
            its hackers are rated. Claim yours to put your school on the board.
          </Empty>
        )}
      </Win>
    </>
  );
}
