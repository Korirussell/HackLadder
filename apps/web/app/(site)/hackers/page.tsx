import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LadderTable } from "@/components/site/boards";
import { Empty, Pager } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SectionHead, Win } from "@/components/os/window";
import { getLadder, getProvisionalCount, getSchoolOptions, PER_PAGE } from "@/lib/data";
import { num, pageParam, pages } from "@/lib/format";

export const metadata: Metadata = {
  title: "The ladder",
  description: "Every hackathon hacker with three or more rated events, ranked by rating.",
  alternates: { canonical: "/hackers" },
};

export default function HackersPage(props: PageProps<"/hackers">) {
  return (
    <>
      <SectionHead as="h1" title="The ladder">
        Hackers with three or more rated events in the last 18 months, by rating. Updated every Monday.
      </SectionHead>
      <Suspense fallback={<LoadingWin title="~/ladder" />}>
        <Ladder searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Ladder({ searchParams }: Pick<PageProps<"/hackers">, "searchParams">) {
  const sp = await searchParams;
  const school = typeof sp.school === "string" && sp.school ? sp.school : null;
  const page = pageParam(sp.page);
  const [rows, provisional, schools] = await Promise.all([getLadder(page, school), getProvisionalCount(), getSchoolOptions()]);
  const total = rows[0]?.total ?? 0;
  const last = pages(total, PER_PAGE);
  const schoolName = schools.find((s) => s.slug === school)?.name;
  const href = (p: number) => `/hackers?${new URLSearchParams({ ...(school ? { school } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <>
      {schools.length > 0 && (
        <form action="/hackers" className="sys mb-4 flex flex-wrap items-center gap-2 text-muted">
          <label htmlFor="school">school</label>
          <select
            id="school"
            name="school"
            defaultValue={school ?? ""}
            className="rounded-md border border-line bg-win px-2 py-1 text-ink"
          >
            <option value="">all schools</option>
            {schools.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md border border-line bg-win px-2.5 py-1 text-ink hover:border-ink">
            filter
          </button>
          {school && (
            <Link href="/hackers" className="hover:text-ink">
              clear
            </Link>
          )}
        </form>
      )}
      <Win
        title={schoolName ? `~/ladder/${schoolName.toLowerCase()}` : "~/ladder"}
        meta="sorted by rating ↓"
        status={[
          `${num(total)} ranked · ${num(provisional)} provisional`,
          <Pager key="p" page={Math.min(page, last)} last={last} href={href} />,
        ]}
      >
        {rows.length ? (
          <LadderTable rows={rows} selectFirst={page === 1 && !school} />
        ) : page > 1 ? (
          <Empty action={<Link href={href(1)} className="underline">Back to page 1</Link>}>There&apos;s no page {page}.</Empty>
        ) : (
          <Empty>
            {school
              ? `Nobody from ${schoolName ?? "that school"} is on the ladder yet. Hackers add their school after claiming.`
              : "Nobody has three rated events yet. The ladder fills in as events are crawled and rated."}
          </Empty>
        )}
      </Win>
      <p className="mt-4 max-w-[70ch] text-[14px] text-muted">
        Fewer than three rated events? You&apos;re provisional: your profile has a rating, but no rank yet. Hackers with no
        rated event in 18 months leave the live ladder and keep their profile.
      </p>
    </>
  );
}
