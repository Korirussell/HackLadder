import { connection, NextResponse } from "next/server";

import { asUsername } from "@/lib/add";
import { getAddRequest } from "@/lib/add-data";

// The status page's poll: always fresh, never cached (spec 2026-10-29-find-yourself).
export async function GET(_req: Request, ctx: RouteContext<"/api/add/[username]">) {
  await connection();
  const username = asUsername(decodeURIComponent((await ctx.params).username));
  if (!username) return NextResponse.json({ error: "not a Devpost username" }, { status: 400 });
  return NextResponse.json(await getAddRequest(username), { headers: { "Cache-Control": "no-store" } });
}
