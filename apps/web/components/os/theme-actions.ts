"use server";

import { isTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/server";

/** Saves a signed-in owner's theme choice to people.ui_theme, so it follows them (§4.7). */
export async function saveUiTheme(theme: string): Promise<void> {
  if (!isTheme(theme)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return;
  // RLS limits this to the caller's own claimed row; with no claimed profile it updates nothing.
  await supabase.from("people").update({ ui_theme: theme }).eq("claimed_by", data.claims.sub);
}
