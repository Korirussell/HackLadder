import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Empty } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SearchHoldingWindow } from "@/components/site/search-window";
import { SectionHead, Win } from "@/components/os/window";
import { searchAll } from "@/lib/data";
import { GROUP_LABEL, groupHits, hitDetail, hitHref, normalizeQuery } from "@/lib/search";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

// Where "Find me" lands without JavaScript, or when the dropdown had nothing picked.
export default function SearchPage(props: PageProps<"/search">) {
  return (
    <>
      <SectionHead as="h1" title="Find anyone">
        Hackers by name or Devpost username, schools, and every public hackathon on Devpost.
      </SectionHead>
      <div className="grid max-w-[880px] gap-6">
        <SearchHoldingWindow autoFocus />
        <Suspense fallback={<LoadingWin title="results" height={200} />}>
          <Results searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const raw = (await searchParams).q;
  const q = normalizeQuery(typeof raw === "string" ? raw : null);
  if (!q) return null;
  const hits = await searchAll(q);
  const groups = groupHits(hits);
  return (
    <Win title="results" meta={`“${q}”`}>
      {groups.length ? (
        groups.map((g) => (
          <div key={g.kind}>
            <div className="sys border-b border-line bg-chrome px-3.5 py-1.5 text-[11px] text-muted">{GROUP_LABEL[g.kind]}</div>
            {g.hits.map((h) => (
              <Link key={`${h.kind}-${h.slug}`} href={hitHref(h)} className="flex items-baseline justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 hover:bg-select hover:text-select-ink">
                <span className="font-semibold">{h.name}</span>
                <span className="sys text-[11px] opacity-75">{hitDetail(h)}</span>
              </Link>
            ))}
          </div>
        ))
      ) : (
        <Empty>No results for &lsquo;{q}&rsquo;. Try your Devpost username.</Empty>
      )}
    </Win>
  );
}
