import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";

import { Avatar } from "@/components/site/avatar";
import { Button, Change, Empty, PageTitle, Prop } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { OwnerTheme } from "@/components/site/owner-theme";
import { RatingChart } from "@/components/site/rating-chart";
import { Chip, Win } from "@/components/os/window";
import { getHacker, getLadder } from "@/lib/data";
import { devpostProject, devpostUser, initials, isoDate, monthYear, num, odds, plural, tierLabel, topPercent } from "@/lib/format";
import type { HackerEvent, HackerPage } from "@/lib/pages";
import { arrangeProjects, arrangeTrophies, readLayout } from "@/lib/profile-layout";

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
    // Same rule as sitemap_entries(): only hackers on the board or with a placement get indexed,
    // not the ~66k provisional entrants who never placed (§15 2026-10-23).
    ...(r && (!r.provisional || r.placements > 0) ? {} : { robots: { index: false, follow: true } }),
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
        avatar={h.is_claimed ? <Avatar name={h.display_name} path={h.avatar_path} size={112} /> : undefined}
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
            {h.links.website && <Chip href={h.links.website}>website ↗</Chip>}
            {h.links.github && <Chip href={h.links.github}>github ↗</Chip>}
            {h.links.linkedin && <Chip href={h.links.linkedin}>linkedin ↗</Chip>}
            {h.is_claimed && <Chip>✓ claimed</Chip>}
          </>
        }
      >
        {h.display_name}
      </PageTitle>

      <div className="grid grid-cols-[1.25fr_1fr] items-start gap-6 max-[980px]:grid-cols-1">
        <div className="grid gap-6">
          <History h={h} />
          <TrophyCabinet h={h} />
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

          {h.bio && (
            <Win title="about">
              <p className="whitespace-pre-line p-3.5">{h.bio}</p>
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

function TrophyCabinet({ h }: { h: HackerPage }) {
  const trophies = arrangeTrophies(h.trophies ?? [], h.layout); // ?? []: pages cached before migration 20261021000100
  if (!trophies.length) return null;
  const grand = trophies.filter((t) => t.tier === 1).length;
  return (
    <Win
      title="trophy_cabinet"
      meta={plural(trophies.length, "prize")}
      status={[grand ? plural(grand, "grand prize") : "placing prizes", h.is_claimed ? "arranged by its owner" : "best first"]}
    >
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-px bg-line">
        {trophies.map((t) => (
          <li key={t.key} className="grid content-start gap-1.5 bg-win p-3.5">
            <span className={`sys w-fit rounded-full border px-2 py-px text-[10.5px] ${t.tier === 1 ? "border-ink bg-ink text-bg" : "border-line text-muted"}`}>
              {tierLabel(t.tier)}
            </span>
            <b className="text-[15px] leading-snug font-semibold tracking-[-0.01em]">{t.prize}</b>
            <span className="sys text-[11px] text-muted">
              <Link href={`/e/${t.event_slug}`} className="hover:text-ink hover:underline">
                {t.event}
              </Link>{" "}
              · {monthYear(t.ends_on)}
            </span>
            <a href={devpostProject(t.project_slug)} target="_blank" rel="noreferrer" className="sys truncate text-[11px] text-muted hover:text-ink">
              {t.project} ↗
            </a>
          </li>
        ))}
      </ul>
    </Win>
  );
}

function EventLog({ h }: { h: HackerPage }) {
  const layout = readLayout(h.layout);
  const { pinned, rest } = arrangeProjects(h.events, h.layout);
  const shown = rest.slice(0, 60);
  const total = pinned.length + rest.length;
  const Item = layout.projects === "cards" ? ProjectCard : layout.projects === "compact" ? ProjectLine : ProjectRow;
  const list = (events: HackerEvent[]) =>
    layout.projects === "cards" ? (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-px bg-line">
        {events.map((e) => (
          <Item key={e.slug} e={e} />
        ))}
      </ul>
    ) : (
      <ol className="sys text-[12.5px]">
        {events.map((e) => (
          <Item key={e.slug} e={e} />
        ))}
      </ol>
    );
  return (
    <Win
      title={layout.projects === "list" ? "event_log" : "projects"}
      meta={plural(total, "entry", "entries")}
      status={[`${num(pinned.length + shown.length)} of ${num(total)} shown`, pinned.length ? `${num(pinned.length)} pinned` : "sorted by date"]}
    >
      {total ? (
        <>
          {pinned.length > 0 && (
            <div className="border-b border-line">
              <p className="sys border-b border-line bg-chrome px-3.5 py-1.5 text-[11px] text-muted">pinned</p>
              {list(pinned)}
            </div>
          )}
          {list(shown)}
        </>
      ) : (
        <Empty>No events on record.</Empty>
      )}
    </Win>
  );
}

function change(e: HackerEvent) {
  return e.change === null ? <span className="text-muted">unrated</span> : <Change value={e.change} />;
}

function ProjectRow({ e }: { e: HackerEvent }) {
  return (
    <li className="grid grid-cols-[88px_1fr_auto_56px] items-center gap-3 border-b border-line px-3.5 py-[9px] last:border-b-0 max-[980px]:grid-cols-[70px_1fr_48px]">
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
      <span className="text-right font-semibold">{change(e)}</span>
    </li>
  );
}

function ProjectCard({ e }: { e: HackerEvent }) {
  return (
    <li className="grid content-start gap-1.5 bg-win p-3.5">
      <a href={devpostProject(e.project_slug)} target="_blank" rel="noreferrer" className="text-[17px] leading-snug font-bold tracking-[-0.015em] hover:underline">
        {e.project} ↗
      </a>
      <span className="sys text-[11px] text-muted">
        <Link href={`/e/${e.slug}`} className="hover:text-ink hover:underline">
          {e.title}
        </Link>{" "}
        · {monthYear(e.ends_on)}
      </span>
      <span className="sys flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="truncate text-muted" title={e.prize ?? undefined}>
          {e.prize ?? tierLabel(e.tier)}
        </span>
        <span className="font-semibold">{change(e)}</span>
      </span>
    </li>
  );
}

function ProjectLine({ e }: { e: HackerEvent }) {
  return (
    <li className="flex items-baseline gap-2 border-b border-line px-3.5 py-1.5 last:border-b-0">
      <span className="w-[62px] shrink-0 text-muted">{isoDate(e.ends_on).slice(0, 7)}</span>
      <a href={devpostProject(e.project_slug)} target="_blank" rel="noreferrer" className="truncate font-semibold hover:underline">
        {e.project}
      </a>
      <span className="truncate text-muted">
        @{" "}
        <Link href={`/e/${e.slug}`} className="hover:text-ink hover:underline">
          {e.title}
        </Link>
      </span>
      <span className="ml-auto shrink-0">{e.tier ? tierLabel(e.tier) : ""}</span>
    </li>
  );
}
