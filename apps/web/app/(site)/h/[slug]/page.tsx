import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";

import { Button, Change, Empty, PageTitle, Prop } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { OwnerTheme } from "@/components/site/owner-theme";
import { RatingChart } from "@/components/site/rating-chart";
import { Chip, Win } from "@/components/os/window";
import { getHacker, getLadder } from "@/lib/data";
import { devpostProject, devpostUser, initials, isoDate, monthYear, num, odds, plural, tierLabel, topPercent } from "@/lib/format";
import type { HackerPage } from "@/lib/pages";

export async function generateStaticParams() {
  const top = await getLadder(1, null, 20);
  // Cache Components needs at least one param; the placeholder renders the 404.
  return top.length ? top.map((r) => ({ slug: r.slug })) : [{ slug: "_" }];
}

export async function generateMetadata({ params }: PageProps<"/h/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const h = await getHacker(slug);
  if (!h) return { title: "Not found", robots: { index: false } };
  const r = h.rating;
  const line = r
    ? `${h.rank ? `#${num(h.rank)} on HackLadder` : "Provisional"} · rating ${num(r.score)} · ${plural(r.events, "rated event")}`
    : "On HackLadder";
  return {
    title: h.display_name,
    description: `${h.display_name}: ${line}. Hackathon results from Devpost, rated by who they beat.`,
    alternates: { canonical: `/h/${h.slug}` },
    openGraph: { title: `${h.display_name} · HackLadder`, description: line, images: [`/og/h/${h.slug}`] },
  };
}

export default function HackerProfile(props: PageProps<"/h/[slug]">) {
  return (
    <Suspense fallback={<LoadingWin title="rating_history" height={480} />}>
      <Profile params={props.params} />
    </Suspense>
  );
}

async function Profile({ params }: Pick<PageProps<"/h/[slug]">, "params">) {
  const { slug } = await params;
  const h = await getHacker(slug);
  if (!h) notFound();
  const r = h.rating;
  const username = h.usernames[0];

  return (
    <>
      {h.profile_theme && <OwnerTheme theme={h.profile_theme} />}
      <PageTitle
        chips={
          <>
            {h.rank ? (
              <Chip accent>
                #{num(h.rank)} of {num(h.board_size)}
              </Chip>
            ) : (
              <Chip>{r ? "Provisional" : "Unrated"}</Chip>
            )}
            {h.tier && <Chip>{h.tier}</Chip>}
            {topPercent(r?.percentile) && <Chip>{topPercent(r?.percentile)}</Chip>}
            {h.school && (
              <Link href={`/s/${h.school.slug}`} className="sys inline-flex items-center rounded-full border border-line bg-win px-2.5 py-1 hover:border-ink">
                {h.school.name}
              </Link>
            )}
            {h.usernames.map((u) => (
              <Chip key={u} href={devpostUser(u)}>
                devpost/{u} ↗
              </Chip>
            ))}
            {h.is_claimed && <Chip>✓ claimed</Chip>}
          </>
        }
      >
        {h.display_name}
      </PageTitle>

      <div className="grid grid-cols-[1.25fr_1fr] items-start gap-6 max-[980px]:grid-cols-1">
        <div className="grid gap-6">
          <History h={h} />
          <EventLog h={h} />
        </div>
        <div className="grid gap-6">
          <Win title="properties">
            <Prop label="grand prizes">{num(r?.grand_prizes ?? 0)}</Prop>
            <Prop label="placed">
              {num(r?.placements ?? 0)} of {num(r?.events ?? h.events.length)}
            </Prop>
            <Prop label="toughest win">
              {h.toughest_win ? (
                <Link href={`/e/${h.toughest_win.slug}`} className="hover:underline">
                  {h.toughest_win.title}
                  {h.toughest_win.win_odds ? ` · ${odds(h.toughest_win.win_odds)}` : ""}
                </Link>
              ) : (
                "none yet"
              )}
            </Prop>
            <Prop label="best crew">
              {h.best_crew ? (
                <span>
                  with{" "}
                  {h.best_crew.members
                    .filter((m) => m.slug !== h.slug)
                    .map((m, i, rest) => (
                      <Fragment key={m.slug}>
                        <Link href={`/h/${m.slug}`} className="hover:underline">
                          {m.name}
                        </Link>
                        {i < rest.length - 2 ? ", " : i === rest.length - 2 ? " and " : ""}
                      </Fragment>
                    ))}
                </span>
              ) : (
                "needs 2 events with the same teammates"
              )}
            </Prop>
            <Prop label="active since">{monthYear(h.active_since, "long")}</Prop>
          </Win>

          {(h.bio || Object.keys(h.links).length > 0) && (
            <Win title="about">
              <div className="grid gap-3 p-3.5">
                {h.bio && <p className="whitespace-pre-line">{h.bio}</p>}
                <div className="flex flex-wrap gap-2">
                  {h.links.github && <Chip href={h.links.github}>github ↗</Chip>}
                  {h.links.linkedin && <Chip href={h.links.linkedin}>linkedin ↗</Chip>}
                  {h.links.website && <Chip href={h.links.website}>website ↗</Chip>}
                </div>
              </div>
            </Win>
          )}

          <Win title="frequent_teammates">
            {h.teammates.length ? (
              h.teammates.map((m) => (
                <Link
                  key={m.slug}
                  href={`/h/${m.slug}`}
                  className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 hover:bg-[color-mix(in_srgb,var(--chrome)_50%,transparent)]"
                >
                  <span className="sys grid size-[30px] place-items-center rounded-lg bg-chrome text-[11px] font-semibold" aria-hidden="true">
                    {initials(m.name)}
                  </span>
                  <b className="font-semibold">{m.name}</b>
                  <span className="sys ml-auto text-muted">{plural(m.events, "event")}</span>
                </Link>
              ))
            ) : (
              <Empty>No teammates on record yet.</Empty>
            )}
          </Win>

          <div className="flex flex-wrap gap-2.5 rounded-win border border-line bg-win p-[22px] shadow-win">
            <Button href={`/og/h/${h.slug}`} external>
              Share rank card
            </Button>
            <Button href={`/corrections/new?person=${encodeURIComponent(h.slug)}`} alt>
              Something wrong?
            </Button>
            {!h.is_claimed && username && (
              <Button href={`/claim?u=${encodeURIComponent(username)}`} alt>
                This is me
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function History({ h }: { h: HackerPage }) {
  const r = h.rating;
  const first = h.history[0]?.ends_on?.slice(0, 4);
  const lastYear = h.history.at(-1)?.ends_on?.slice(0, 4);
  return (
    <Win
      title="rating_history"
      meta={first ? (first === lastYear ? first : `${first} → ${lastYear}`) : undefined}
      status={["conservative rating: μ − 3σ", `last event: ${monthYear(r?.last_event_on)}`]}
    >
      <div className="grid grid-cols-3 [&>div]:border-r [&>div]:border-line [&>div]:p-[18px] [&>div:last-child]:border-r-0">
        <div>
          <b className="stat block text-[40px] leading-none max-[980px]:text-[30px]">{r ? num(r.score) : "—"}</b>
          <span className="sys text-[11px] text-muted">rating</span>
        </div>
        <div>
          <b className="stat block text-[40px] leading-none max-[980px]:text-[30px]">
            <Change value={h.month_change} />
          </b>
          <span className="sys text-[11px] text-muted">this month</span>
        </div>
        <div>
          <b className="stat block text-[40px] leading-none max-[980px]:text-[30px]">{num(r?.events ?? 0)}</b>
          <span className="sys text-[11px] text-muted">rated events</span>
        </div>
      </div>
      {h.history.length ? (
        <RatingChart points={h.history} name={h.display_name} />
      ) : (
        <Empty>No rated events yet. Ratings count in-person MLH member events and events an admin adds.</Empty>
      )}
    </Win>
  );
}

function EventLog({ h }: { h: HackerPage }) {
  const shown = h.events.slice(0, 60);
  return (
    <Win
      title="event_log"
      meta={plural(h.events.length, "entry", "entries")}
      status={[`${num(shown.length)} of ${num(h.events.length)} shown`, "sorted by date"]}
    >
      {shown.length ? (
        <ol className="sys text-[12.5px]">
          {shown.map((e) => (
            <li
              key={e.slug}
              className="grid grid-cols-[88px_1fr_auto_56px] items-center gap-3 border-b border-line px-3.5 py-[9px] last:border-b-0 max-[980px]:grid-cols-[70px_1fr_48px]"
            >
              <span className="text-muted">{isoDate(e.ends_on)}</span>
              <span className="min-w-0">
                <Link href={`/e/${e.slug}`} className="font-sans text-[15px] font-semibold tracking-[-0.01em] hover:underline">
                  {e.title}
                </Link>
                <a href={devpostProject(e.project_slug)} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-muted hover:text-ink">
                  {e.project} ↗
                </a>
              </span>
              <span className="max-w-[22ch] truncate text-muted max-[980px]:hidden" title={e.prize ?? undefined}>
                {e.prize ?? tierLabel(e.tier)}
              </span>
              <span className="text-right font-semibold">{e.change === null ? <span className="text-muted">unrated</span> : <Change value={e.change} />}</span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>No events on record.</Empty>
      )}
    </Win>
  );
}
