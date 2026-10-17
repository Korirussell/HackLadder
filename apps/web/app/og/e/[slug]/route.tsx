import { notFound } from "next/navigation";

import { getEvent } from "@/lib/data";
import { fileName, num, odds, plural } from "@/lib/format";
import { renderCard } from "@/lib/og";

export async function GET(_req: Request, ctx: RouteContext<"/og/e/[slug]">) {
  const { slug } = await ctx.params;
  const e = await getEvent(slug);
  if (!e) notFound();
  const s = e.strength;
  return renderCard({
    file: fileName(e.title, "mov"),
    meta: e.location ?? undefined,
    chip: e.rank ? `Hardest to win #${num(e.rank)}` : undefined,
    title: e.title,
    lines: s?.win_odds
      ? [`${odds(s.win_odds)} for a 90th-percentile team`, `${plural(s.teams, "team")} · ${num(s.elite)} elite`]
      : [`${plural(e.projects, "project")} on Devpost`],
    status: ["hackladder.com", `/e/${e.slug}`],
  });
}
