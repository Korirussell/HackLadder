import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { SectionHead, Win } from "@/components/os/window";
import { getRankTiers } from "@/lib/data";

export const metadata: Metadata = {
  title: "How ratings work",
  description: "HackLadder's rating model in plain language: every win is weighted by who you beat.",
  alternates: { canonical: "/how-ratings-work" },
};

// Simulation floors and the last measured results (CLAUDE.md §8.5). The rating-quality test
// in pipeline/tests asserts the floors on every CI run.
const SIMULATION = [
  { metric: "Hacker rank vs true skill (3+ events)", floor: "≥ 0.55", measured: "0.62" },
  { metric: "Event rating vs true win odds", floor: "≥ 0.75", measured: "0.84" },
  { metric: "Series rating vs true prestige", floor: "≥ 0.80", measured: "0.88" },
  { metric: "Beginner jams in the event top 20", floor: "0", measured: "0" },
  { metric: "Planted best duo's rank", floor: "top 10", measured: "#1" },
];

export default async function Method() {
  const tiers = await getRankTiers();
  return (
    <>
      <SectionHead as="h1" title="How ratings work">
        Plain language first. The math is underneath, for anyone who wants to check it.
      </SectionHead>

      <div className="grid max-w-[880px] gap-6">
        <Win title="readme.txt">
          <div className="grid gap-4 p-[22px] text-[17px] leading-[1.55]">
            <p>
              <b>Every win is weighted by who you beat.</b> Taking first against a room of past winners moves your rating far
              more than winning a small event nobody strong entered.
            </p>
            <p>
              Each hackathon becomes a ranking of every team that submitted: grand prizes first, then main-track winners, then
              sponsor prizes, then tech prizes like &ldquo;best use of&rdquo;, then everyone who submitted and didn&apos;t place, tied.
              Your team&apos;s result updates every member&apos;s rating, replayed in date order from the first event. Bigger
              events move ratings more: winning against 150 teams is worth about 1.5 times as much as winning against 30.
            </p>
            <p>
              Your rating is a cautious estimate: <b>1000 + 200 × (skill − 3 × uncertainty)</b>. Everyone starts near 1000, and a
              single lucky win can&apos;t put you at the top, because one result leaves a lot of uncertainty.
            </p>
            <p>
              You need <b>three rated events</b> to get a rank. Until then you&apos;re provisional. If you haven&apos;t competed in 18
              months you leave the live ladder, but your rating never decays.
            </p>
            <p>
              Ratings count <b>in-person MLH member events</b>, plus events an admin adds by hand. Open online jams don&apos;t count:
              they let the same project be resubmitted to farm results. High-school events never count, and their entrants are
              never shown.
            </p>
            <p>Ratings are rebuilt from scratch every Monday from public Devpost results. Nobody edits a rating by hand.</p>
          </div>
        </Win>

        <Win title="rank_tiers" meta="named bands over ranked hackers">
          {tiers.map((t) => (
            <div key={t.name} className="flex justify-between gap-4 border-b border-line px-3.5 py-2.5 last:border-b-0">
              <b className="font-semibold">{t.name}</b>
              <span className="sys text-muted">
                {t.top_n ? `top ${t.top_n} overall` : t.top_percent ? `top ${t.top_percent}%` : "everyone else"}
              </span>
            </div>
          ))}
        </Win>

        <Win title="event_odds">
          <div className="grid gap-4 p-[22px] text-[17px] leading-[1.55]">
            <p>
              <b>&ldquo;1 in 214&rdquo;</b> is the chance that a team of 90th-percentile hackers would take first against the exact
              field that showed up. Bigger fields and stronger entrants make it longer.
            </p>
            <p>
              Events are ranked mostly on how many elite hackers (the global top 5%) entered, and partly on those odds. Odds alone
              over-rate huge beginner jams whose regulars only ever play each other.
            </p>
          </div>
        </Win>

        <MathNote title="The rating model">
          <p>
            Ratings use <b>OpenSkill&apos;s Plackett-Luce model</b>, a Bayesian rating system for many-team, multiplayer results. Each
            hacker has a skill estimate μ and an uncertainty σ. A team is rated as its members; private or deleted team members
            count as unrated average players. A person on two projects at one event keeps only their best-placed one.
          </p>
          <p>
            Plackett-Luce on its own moves ratings less the more teams there are, so a win at an 11-team event counted three
            times as much as one at a 150-team event. Each event&apos;s update is scaled by <code>(teams / 50)^0.75</code>, which
            makes a bigger field worth more.
          </p>
          <p>
            Winning several prizes at one event counts for more. Each placing prize after a team&apos;s best one puts it ahead of
            teams with the same best prize, and adds to its gain: half again for another top or track prize, a third for a
            sponsor prize, a quarter for an MLH or tech prize, up to double. Extra prizes are easier to sweep in a small field,
            so below 50 teams the bonus shrinks with the event.
          </p>
          <p>
            The displayed rating is <code>1000 + 200 × (μ − 3σ)</code>, a conservative lower bound: a new hacker has μ = 25, σ = 25/3,
            so starts at 1000.
          </p>
        </MathNote>

        <MathNote title="Event difficulty">
          <p>
            Every entrant is judged by their final rating, conservatively (μ − 1σ), so first-timers count as unproven rather than as
            wildcards. Win odds are computed by numerical integration over the field, with per-event noise calibrated on who
            actually won. Event rating = 70% z(log(1 + elite)) + 30% z(log win odds). A series&apos; rating is the mean of its
            editions&apos; z-scores, shrunk by n/(n + 1).
          </p>
          <p>
            Judging agreement is the rank correlation between pre-event team strength and the final placing. It&apos;s context on
            event pages, not part of any rating.
          </p>
        </MathNote>

        <MathNote title="Crews and schools">
          <p>
            A crew is two or more people who were on the same team at two or more events. Crew score = (placements + 1)/(events
            + 4) + 0.5 × overperformance × events/(events + 3), where overperformance is how far the team finished above what its
            ratings predicted. A school&apos;s rating is the mean of its top 10 ranked hackers who were active that season, and a school
            needs five rated hackers to appear. Schools come only from hackers who claimed their profile.
          </p>
        </MathNote>

        <Win title="simulation_results" meta="the rating model's regression test">
          <p className="p-3.5 text-[15px] text-muted">
            A simulation generates hackers with hidden true skill, recurring events with hidden prestige, and big beginner-only
            online jams, then checks how well the model recovers them. Every change to the math has to pass it.
          </p>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="sys text-left text-[11px] text-muted [&>th]:border-y [&>th]:border-line [&>th]:px-3.5 [&>th]:py-2 [&>th]:font-medium">
                <th scope="col">metric</th>
                <th scope="col">floor</th>
                <th scope="col" className="text-right">last measured</th>
              </tr>
            </thead>
            <tbody>
              {SIMULATION.map((s) => (
                <tr key={s.metric} className="border-b border-line last:border-b-0">
                  <td className="px-3.5 py-2.5">{s.metric}</td>
                  <td className="sys px-3.5 py-2.5 text-muted">{s.floor}</td>
                  <td className="sys px-3.5 py-2.5 text-right font-semibold">{s.measured}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Win>

        <Win title="trust">
          <div className="grid gap-3 p-[22px]">
            <p>
              Profiles are made only from what you already published on Devpost: your username, display name, projects and prizes.
              No emails, no photos, no LinkedIn. Every page links back to Devpost.
            </p>
            <p>
              Something wrong? Every profile has a <b>Something wrong?</b> button. Want off HackLadder?{" "}
              <Link href="/remove" className="underline">
                Remove yourself
              </Link>{" "}
              with no account and no questions. Your results still count for the people you competed against, shown as
              &ldquo;Hidden hacker&rdquo;.
            </p>
          </div>
        </Win>
      </div>
    </>
  );
}

function MathNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group overflow-hidden rounded-win border border-line bg-win shadow-win">
      <summary className="sys flex h-[34px] cursor-pointer list-none items-center gap-2.5 bg-chrome px-3 group-open:border-b group-open:border-line">
        <span aria-hidden="true">{"▸"}</span>
        <span>math: {title.toLowerCase()}</span>
        <span className="ml-auto text-muted group-open:hidden">expand</span>
      </summary>
      <div className="grid gap-3 p-[22px] text-[16px] leading-[1.55]">{children}</div>
    </details>
  );
}
