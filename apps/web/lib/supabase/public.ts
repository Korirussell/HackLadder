import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { supabaseEnv } from "./server";

/**
 * A Supabase client with no session, for public pages. It reads cookies from nowhere, so its
 * results can be cached ("use cache") and shared by every visitor. RLS treats it as anon.
 * Null when Supabase isn't configured (CI builds), so pages render their empty states.
 */
export function publicClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const { url, key } = supabaseEnv();
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
