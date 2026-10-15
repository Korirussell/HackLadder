import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HackLadderBot · HackLadder",
  description: "What HackLadderBot fetches, how often, and how to reach us.",
};

// Linked from the crawler's User-Agent: HackLadderBot/1.0 (+https://hackladder.com/bot). See CLAUDE.md §6.2.
export default function BotPage() {
  return (
    <main className="mx-auto max-w-content px-4 py-24 min-[900px]:pl-[calc(var(--spacing-rail)+40px)]">
      <h1 className="display text-section">HackLadderBot</h1>
      <div className="mt-10 grid max-w-[62ch] gap-5">
        <p className="text-sub">HackLadder ranks hackathon results. Our crawler reads public results pages to build those rankings.</p>
        <p>
          <b>What it reads.</b> Public hackathon listings, project galleries and project pages on Devpost, and Major League
          Hacking&apos;s public season schedules. Nothing behind a login, and never personal contact details.
        </p>
        <p>
          <b>How politely.</b> One request at a time, at least 1.5 seconds apart. It honors robots.txt, backs off on errors
          and rate limits, and keeps a copy of every page so it never has to fetch the same page twice. After the first
          crawl, it checks for new results once a week.
        </p>
        <p>
          <b>It identifies itself</b> as <code>HackLadderBot/1.0 (+https://hackladder.com/bot)</code>.
        </p>
        <p>
          <b>Want it to stop, or to slow down?</b> Disallow <code>HackLadderBot</code> in your robots.txt and it will stop on
          its next run.
        </p>
      </div>
    </main>
  );
}
