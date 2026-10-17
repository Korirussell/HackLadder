import { type NextRequest, NextResponse } from "next/server";

import { publicClient } from "@/lib/supabase/public";
import { normalizeQuery, type SearchHit } from "@/lib/search";

// The instant dropdown's data (§7.8): the search() RPC, top 8, cached briefly at the edge.
export async function GET(request: NextRequest) {
  const q = normalizeQuery(request.nextUrl.searchParams.get("q"));
  if (!q) return NextResponse.json({ hits: [] satisfies SearchHit[] });
  const supabase = publicClient();
  if (!supabase) return NextResponse.json({ hits: [] }, { status: 503 });
  const { data, error } = await supabase.rpc("search", { q, lim: 8 });
  if (error) return NextResponse.json({ error: "Search is unavailable right now. Try again in a moment." }, { status: 502 });
  return NextResponse.json(
    { hits: (data ?? []) as SearchHit[] },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
