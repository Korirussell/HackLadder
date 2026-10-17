import { notFound } from "next/navigation";

import { getSchool } from "@/lib/data";
import { fileName, num, plural } from "@/lib/format";
import { renderCard } from "@/lib/og";

export async function GET(_req: Request, ctx: RouteContext<"/og/s/[slug]">) {
  const { slug } = await ctx.params;
  const s = await getSchool(slug);
  if (!s) notFound();
  return renderCard({
    file: fileName(s.name, "school"),
    meta: s.rating?.season,
    numeral: s.rating?.rank ? `#${s.rating.rank}` : undefined,
    title: s.name,
    lines: [s.rating ? `Top-10 rating ${num(s.rating.rating)}` : "School vs school", plural(s.members, "hacker")],
    status: ["hackladder.com", `/s/${s.slug}`],
  });
}
