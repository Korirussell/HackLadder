import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LadderTable } from "@/components/site/boards";
import { Empty, PageTitle } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { Chip, Win } from "@/components/os/window";
import { getLadder, getSchool, getSchoolBoard } from "@/lib/data";
import { isoDate, num, plural } from "@/lib/format";

export async function generateStaticParams() {
  const top = await getSchoolBoard();
  return top.length ? top.slice(0, 20).map((s) => ({ slug: s.slug })) : [{ slug: "_" }];
}

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = await getSchool(slug);
  if (!s) return { title: "Not found", robots: { index: false } };
  const line = s.rating?.rank ? `#${s.rating.rank} in ${s.rating.season}, rating ${num(s.rating.rating)}` : "On HackLadder";
  return {
    title: s.name,
    description: `${s.name} hackers on HackLadder: ${line}.`,
    alternates: { canonical: `/s/${s.slug}` },
    openGraph: { title: `${s.name} · HackLadder`, description: line, images: [`/og/s/${s.slug}`] },
  };
}

export default function SchoolProfile(props: PageProps<"/s/[slug]">) {
  return (
    <Suspense fallback={<LoadingWin title="top_hackers" />}>
      <School params={props.params} />
    </Suspense>
  );
}

async function School({ params }: Pick<PageProps<"/s/[slug]">, "params">) {
  const { slug } = await params;
  const [s, hackers] = await Promise.all([getSchool(slug), getLadder(1, slug, 10)]);
  if (!s) notFound();
  return (
    <>
      <PageTitle
        chips={
          <>
            {s.rating?.rank ? <Chip accent>#{s.rating.rank} in {s.rating.season}</Chip> : <Chip>unranked</Chip>}
            {s.rating && <Chip>rating {num(s.rating.rating)}</Chip>}
            <Chip>{plural(s.members, "hacker")}</Chip>
            {s.country && <Chip>{s.country}</Chip>}
          </>
        }
      >
        {s.name}
      </PageTitle>
      <div className="grid grid-cols-[1.25fr_1fr] items-start gap-6 max-[980px]:grid-cols-1">
        <Win title="top_hackers" meta="on the live ladder" status={[`${num(hackers[0]?.total ?? 0)} ranked`, "ranks are overall"]}>
          {hackers.length ? (
            <LadderTable rows={hackers} selectFirst={false} />
          ) : (
            <Empty>No one from {s.name} is on the live ladder yet.</Empty>
          )}
        </Win>
        <div className="grid gap-6">
          <Win title="rivals" meta={s.rating?.season}>
            {s.rivals.length ? (
              s.rivals.map((r) => (
                <Link key={r.slug} href={`/s/${r.slug}`} className="grid grid-cols-[28px_1fr_auto] gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 hover:bg-[color-mix(in_srgb,var(--chrome)_50%,transparent)]">
                  <span className="sys text-muted">{r.rank}</span>
                  <b className="font-semibold">{r.name}</b>
                  <span className="sys font-semibold">{num(r.rating)}</span>
                </Link>
              ))
            ) : (
              <Empty>Rivals show once this school is ranked.</Empty>
            )}
          </Win>
          <Win title="recent_wins">
            {s.recent_wins.length ? (
              <ol className="sys text-[12.5px]">
                {s.recent_wins.map((w, i) => (
                  <li key={`${w.event_slug}-${w.person_slug}-${i}`} className="border-b border-line px-3.5 py-2.5 last:border-b-0">
                    <span className="text-muted">{isoDate(w.ends_on)}</span>{" "}
                    <Link href={`/e/${w.event_slug}`} className="font-sans text-[15px] font-semibold hover:underline">
                      {w.event}
                    </Link>
                    <span className="block text-muted">
                      <Link href={`/h/${w.person_slug}`} className="hover:text-ink">
                        {w.person}
                      </Link>{" "}
                      · {w.prize}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No placements on record yet.</Empty>
            )}
          </Win>
        </div>
      </div>
    </>
  );
}
