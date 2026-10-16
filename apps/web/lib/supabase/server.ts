import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";

export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (apps/web/.env, or Vercel env vars)");
  }
  if (!/^https?:\/\/[^\s"']+$/.test(url)) {
    // Never echo the value; say what's wrong with it.
    const why = /["']/.test(url)
      ? "it contains quotes"
      : /\s/.test(url)
        ? "it contains spaces or a line break"
        : "it doesn't start with https://";
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL isn't a valid URL: ${why}. It should look like https://<ref>.supabase.co`);
  }
  return { url, key };
}

/**
 * A Supabase client acting as the signed-in user (or anon), for Server Components and
 * Server Actions. Create one per request. RLS decides what it can read and write.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
