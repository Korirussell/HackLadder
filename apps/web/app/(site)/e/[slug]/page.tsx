import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button, Empty, PageTitle, Prop } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { Chip, Screen, Win } from "@/components/os/window";
import { getEvent, getEventBoard } from "@/lib/data";
import { dateRange, devpostProject, fileName, isoDate, num, odds, plural, timecode, tierLabel } from "@/lib/format";
import type { EventPage } from "@/lib/pages";

export async function generateStaticParams() {
  const top = await getEventBoard(1, {}, 20);
  return top.length ? top.map((e) => ({ slug: e.slug })) : [{ slug: "_" }];
}

export async function generateMetadata({ params }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const e = await getEvent(slug);
  if (!e) return { title: "Not found", robots: { index: false } };
  const line = e.strength?.win_odds
    ? `${odds(e.strength.win_odds)} for a strong team · ${plural(e.strength.teams, "team")} · ${num(e.strength.elite)} elite`
    : "Results from Devpost";
  return {
    title: e.title,
    description: `${e.title}: ${line}. How hard it was to win, and who did.`,
    alternates: { canonical: `/e/${e.slug}` },
    openGraph: { title: `${e.title} · HackLadder`, description: line, images: [`/og/e/${e.slug}`] },
  };
}

export default function EventProfile(props: PageProps<"/e/[slug]">) {
  return (
    <Suspense fallback={<LoadingWin title="event.mov" height={520} />}>
      <Event params={props.params} />
    </Suspense>
  );
}

async function Event({ params }: Pick<PageProps<"/e/[slug]">, "params">) {
  const { slug } = await params;
  const e = await getEvent(slug);
  if (!e) notFound();
  const s = e.strength;
  const podium = e.winners.slice(0, 3);

  return (
    <>
      <PageTitle
        chips={
          <>
            {e.rank && <Chip accent>Hardest to win #{num(e.rank)}</Chip>}
            {e.event_tier && <Chip>{e.event_tier} tier</Chip>}
            <Chip>{e.is_online ? "Online" : (e.location ?? "In person")}</Chip>
            <Chip>{dateRange(e.starts_on, e.ends_on)}</Chip>
            {s && <Chip>{plural(s.teams, "team")}</Chip>}
            {e.is_mlh && <Chip>MLH member event</Chip>}
            <Chip href={e.url}>devpost ↗</Chip>
          </>
        }
      >
        {e.title}
      </PageTitle>

      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-6 max-[980px]:grid-cols-1">
        <Win title={fileName(e.title, "mov")} meta={s ? `${plural(e.projects, "project")}` : undefined}>
          <Screen className="m-3.5 h-[420px] max-[980px]:h-[300px]">
            <div className="flex h-full flex-col justify-between p-[26px]">
              <div className="sys flex justify-between text-muted">
                <span>odds a strong team wins</span>
                {s?.top_field != null && <span>field strength: top-10 μ {s.top_field.toFixed(1)}</span>}
              </div>
              <div className="stat text-[clamp(96px,11vw,190px)] leading-[0.8] tracking-[-0.06em]">
                {s?.win_odds ? odds(s.win_odds) : "unrated"}
                <small className="mt-3.5 block font-sans text-[18px] font-medium tracking-[-0.01em] text-muted">
                  {s?.win_odds
                    ? "for a team of 90th-percentile hackers against this exact field"
                    : unratedReason(e)}
                </small>
              </div>
            </div>
          </Screen>
          <Timeline e={e} />
        </Win>

        <div className="grid gap-6">
          <Win title="field">
            <Prop label="elite hackers (top 5%)">{s ? num(s.elite) : "—"}</Prop>
            <Prop label="teams">{s ? num(s.teams) : num(e.projects)}</Prop>
            <Prop label="avg entrant skill (μ)">{s?.field_mean != null ? s.field_mean.toFixed(1) : "—"}</Prop>
            <Prop label="judging agreement">
              {s?.judging != null ? `${s.judging.toFixed(2)} · ${s.judging >= 0.3 ? "stronger teams placed" : s.judging >= 0.1 ? "some upsets" : "anyone's game"}` : "—"}
            </Prop>
            <Prop label="series">
              {e.series ? (
                <Link href={`/series/${e.series.slug}`} className="hover:underline">
                  {e.series.name} · {plural(e.series.editions.length, "edition")}
                </Link>
              ) : (
                "—"
              )}
            </Prop>
            {e.registrations != null && <Prop label="registered on devpost">{num(e.registrations)}</Prop>}
            {e.prize_total_usd != null && e.prize_total_usd > 0 && <Prop label="prizes">${num(e.prize_total_usd)}</Prop>}
          </Win>
          {e.series && e.series.editions.length > 1 && (
            <Win title="other_editions">
              {e.series.editions
                .filter((o) => o.slug !== e.slug)
                .slice(0, 8)
                .map((o) => (
                  <Link
                    key={o.slug}
                    href={`/e/${o.slug}`}
                    className="sys flex justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 hover:bg-[color-mix(in_srgb,var(--chrome)_50%,transparent)]"
                  >
                    <span className="font-sans text-[15px] font-semibold">{o.title}</span>
                    <span className="text-muted">{isoDate(o.ends_on)}</span>
                  </Link>
                ))}
            </Win>
          )}
        </div>
      </div>

      <Win
        title="winners"
        meta={`${num(podium.length)} of ${plural(e.prizes, "prize")}`}
        className="mt-6"
        status={[
          "placements from Devpost prize names",
          <a key="d" href={e.url} target="_blank" rel="noreferrer" className="hover:text-ink">
            see the gallery on devpost ↗
          </a>,
        ]}
      >
        {podium.length ? (
          <div className="grid grid-cols-3 max-[980px]:grid-cols-1 [&>div]:border-r [&>div]:border-line [&>div:last-child]:border-r-0 max-[980px]:[&>div]:border-r-0 max-[980px]:[&>div]:border-b">
            {podium.map((w) => (
              <div key={w.project_slug} className="p-[18px]">
                <span className="sys text-[11px] text-muted">{w.prizes[0] ?? tierLabel(w.tier)}</span>
                <h3 className="mt-1.5 mb-1 text-[22px] font-extrabold tracking-[-0.04em]">
                  <a href={devpostProject(w.project_slug)} target="_blank" rel="noreferrer" className="hover:underline">
                    {w.title}
                  </a>
                </h3>
                <p className="text-[13px] text-muted">
                  <Members members={w.members} />
                  {w.team_rating ? ` · avg ${num(w.team_rating)}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <Empty action={<Button href={e.url} external>Open on Devpost</Button>}>
            {e.winners_announced ? "We haven't crawled this event's results yet." : "Devpost hasn't announced winners yet."}
          </Empty>
        )}
      </Win>

      {e.winners.length > 3 && (
        <Win title="all_prizes" meta={plural(e.winners.length, "winning project")} className="mt-6">
          <ol className="sys text-[12.5px]">
            {e.winners.slice(3).map((w) => (
              <li key={w.project_slug} className="grid grid-cols-[1fr_1.2fr] gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 max-[980px]:grid-cols-1">
                <span>
                  <a href={devpostProject(w.project_slug)} target="_blank" rel="noreferrer" className="font-sans text-[15px] font-semibold hover:underline">
                    {w.title}
                  </a>
                  <span className="block text-muted">
                    <Members members={w.members} />
                  </span>
                </span>
                <span className="text-muted">{w.prizes.join(" · ")}</span>
              </li>
            ))}
          </ol>
        </Win>
      )}
    </>
  );
}

function Members({ members }: { members: EventPage["winners"][number]["members"] }) {
  if (!members.length) return <>team not listed</>;
  return (
    <>
      {members.slice(0, 4).map((m, i) => (
        <span key={`${m.name}-${i}`}>
          {i > 0 && ", "}
          {m.slug ? (
            <Link href={`/h/${m.slug}`} className="hover:text-ink hover:underline">
              {m.name}
            </Link>
          ) : (
            m.name
          )}
        </span>
      ))}
      {members.length > 4 && ` +${members.length - 4}`}
    </>
  );
}

function unratedReason(e: EventPage): string {
  if (!e.winners_announced) return "winners haven't been announced on Devpost yet";
  if (e.projects === 0) return "this event's results haven't been crawled yet";
  return "ratings count in-person MLH member events and events an admin adds";
}

/** Kickoff, judging and winners on a track with timecode ticks (§4.4). */
function Timeline({ e }: { e: EventPage }) {
  const days = e.starts_on && e.ends_on ? (Date.parse(e.ends_on) - Date.parse(e.starts_on)) / 86_400_000 : NaN;
  const hours = Number.isFinite(days) && days >= 0 && days <= 3 ? Math.max(24, Math.round((days + 1) * 12)) : 36;
  const ticks = [0, 1, 2, 3].map((i) => timecode((i * hours * 3_600_000) / 3));
  return (
    <div className="px-3.5 pb-4" aria-hidden="true">
      <div className="relative h-7 overflow-hidden rounded-lg bg-chrome">
        {[
          { left: 0, width: 8, label: "kickoff" },
          { left: 62, width: 4, label: "judging" },
          { left: 92, width: 8, label: "winners", shift: 90 },
        ].map((b) => (
          <span key={b.label}>
            <i
              className="absolute inset-y-0 border-l-2 border-accent bg-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
              style={{ left: `${b.left}%`, width: `${b.width}%` }}
            />
            <span className="sys absolute top-1.5 pl-2 text-[10.5px]" style={{ left: `${b.shift ?? b.left}%` }}>
              {b.label}
            </span>
          </span>
        ))}
      </div>
      <div className="sys mt-2 flex justify-between text-[11px] text-muted">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
