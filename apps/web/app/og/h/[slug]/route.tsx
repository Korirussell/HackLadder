import { notFound } from "next/navigation";

import { getHacker } from "@/lib/data";
import { fileName, num, plural, topPercent } from "@/lib/format";
import { renderCard } from "@/lib/og";

// A hacker's rank card, in their profile theme once claimed; unclaimed profiles use Paper (§4.7).
export async function GET(_req: Request, ctx: RouteContext<"/og/h/[slug]">) {
  const { slug } = await ctx.params;
  const h = await getHacker(slug);
  if (!h) notFound();
  const r = h.rating;
  return renderCard(
    {
      file: fileName(h.display_name, "card"),
      meta: h.tier ?? undefined,
      numeral: h.rank ? `#${h.rank}` : undefined,
      chip: h.rank ? (topPercent(r?.percentile) ?? undefined) : r ? "Provisional" : undefined,
      title: h.display_name,
      lines: [
        r ? `Rating ${num(r.score)} · ${plural(r.events, "rated event")}` : "On HackLadder",
        ...(h.toughest_win ? [`Best win: ${h.toughest_win.title}`] : []),
      ],
      status: ["hackladder.com", `/h/${h.slug}`],
    },
    h.profile_theme ?? "paper",
  );
}
