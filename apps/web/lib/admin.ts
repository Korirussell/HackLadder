import "server-only";

import { notFound, redirect } from "next/navigation";

import { createClient } from "./supabase/server";

/**
 * Call at the top of every admin page and Server Action. Signed-out visitors go to sign-in;
 * signed-in non-admins get a 404, so the admin area isn't advertised. RLS enforces the same
 * rule again in the database.
 */
export async function requireAdmin(next = "/admin") {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(`Couldn't check admin access: ${error.message}`);
  if (!isAdmin) notFound();

  return { supabase, userId: data.claims.sub, email: data.claims.email as string | undefined };
}
