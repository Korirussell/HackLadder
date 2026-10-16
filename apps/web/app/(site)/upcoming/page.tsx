import type { Metadata } from "next";

import { Empty } from "@/components/site/bits";
import { SectionHead, Win } from "@/components/os/window";
import { getUpcomingEvents } from "@/lib/data";
import { dateRange, plural } from "@/lib/format";

export const metadata: Metadata = {
  title: "Upcoming events",
  description: "Upcoming MLH member hackathons, the events that count toward HackLadder ratings.",
  alternates: { canonical: "/upcoming" },
};

const FORMAT: Record<string, string> = { physical: "in person", digital: "online", hybrid_physical: "hybrid" };

// Phase 5 adds field-strength forecasts and personal odds; for now, the schedule (§10).
export default async function Upcoming() {
  const events = await getUpcomingEvents();
  return (
    <>
      <SectionHead as="h1" title="Coming up">
        Upcoming MLH member events. In-person ones count toward ratings. Odds for each arrive in a later update.
      </SectionHead>
      <Win title="~/upcoming" meta="soonest first" status={[plural(events.length, "event"), "schedule from mlh.com"]}>
        {events.length ? (
          <ol>
            {events.map((e) => (
              <li key={`${e.name}-${e.starts_at}`} className="grid grid-cols-[180px_1fr_auto] items-center gap-4 border-b border-line px-3.5 py-3 last:border-b-0 max-[980px]:grid-cols-1 max-[980px]:gap-1">
                <span className="sys text-muted">{dateRange(e.starts_at, e.ends_at)}</span>
                <span>
                  {e.website_url ? (
                    <a href={e.website_url} target="_blank" rel="noreferrer" className="text-[17px] font-bold tracking-[-0.03em] hover:underline">
                      {e.name} ↗
                    </a>
                  ) : (
                    <b className="text-[17px] tracking-[-0.03em]">{e.name}</b>
                  )}
                  {e.location && <span className="block text-[13px] text-muted">{e.location}</span>}
                </span>
                <span className="sys text-muted">{FORMAT[e.format] ?? e.format}</span>
              </li>
            ))}
          </ol>
        ) : (
          <Empty>No upcoming events on the schedule right now. The MLH schedule is checked every Monday.</Empty>
        )}
      </Win>
    </>
  );
}
