import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

// The pipeline calls this after publishing ratings (§10: on-demand revalidation), with
// Authorization: Bearer $REVALIDATE_SECRET. Without the secret configured it's switched off,
// and pages fall back to their hourly cache lifetime.
const TAGS = new Set(["ratings", "events", "schools", "config"]);

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return NextResponse.json({ error: "Revalidation isn't configured." }, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Wrong or missing token." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { tags?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string" && TAGS.has(t)) : [...TAGS];
  for (const tag of tags) revalidateTag(tag, "max");
  return NextResponse.json({ revalidated: tags });
}
