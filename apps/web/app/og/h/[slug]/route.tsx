import { notFound } from "next/navigation";

import { getHacker } from "@/lib/data";
import { fileName, num, plural, topPercent } from "@/lib/format";
import { renderCard } from "@/lib/og";
import { avatarUrl } from "@/lib/profile-layout";

// A hacker's rank card, in their profile theme once claimed; unclaimed profiles use Paper (§4.7).
export async function GET(_req: Request, ctx: RouteContext<"/og/h/[slug]">) {
  const { slug } = await ctx.params;
  const h = await getHacker(slug);
  if (!h) notFound();
  const r = h.rating;
  const grand = (h.trophies ?? []).filter((t) => t.tier === 1).length;
  return renderCard(
    {
      file: fileName(h.display_name, "card"),
      meta: h.tier ?? undefined,
      numeral: h.rank ? `#${h.rank}` : undefined,
      chip: h.rank ? (topPercent(r?.percentile) ?? undefined) : r ? "Provisional" : undefined,
      title: h.display_name,
      image: (h.is_claimed && avatarUrl(h.avatar_path)) || undefined,
      lines: [
        r ? `Rating ${num(r.score)} · ${plural(r.events, "rated event")}` : "On HackLadder",
        ...(grand ? [`${plural(grand, "grand prize")} · ${plural((h.trophies ?? []).length, "placing prize")}`] : []),
        ...(h.toughest_win ? [`Best win: ${h.toughest_win.title}`] : []),
      ],
      status: ["hackladder.com", `/h/${h.slug}`],
    },
    h.profile_theme ?? "paper",
  );
}
