import { NextResponse } from "next/server";

import { getSiteStats } from "@/lib/data";

// The boot screen's counts, fetched in the browser. In the chrome's HTML they changed every page
// on every publish, and Vercel bills a write for each regenerated page that differs (§15 2026-10-25).
export async function GET() {
  const { hackers, hackathons } = await getSiteStats();
  return NextResponse.json({ hackers, hackathons });
}
