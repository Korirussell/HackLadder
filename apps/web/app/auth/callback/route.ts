import { type NextRequest, NextResponse } from "next/server";

import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// The magic link lands here with a one-time code; exchange it for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  const retry = new URL("/sign-in", origin);
  retry.searchParams.set("next", next);
  retry.searchParams.set("error", "link");
  return NextResponse.redirect(retry);
}
