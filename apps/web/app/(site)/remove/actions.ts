"use server";

import { updateTag } from "next/cache";

import { type BioCode, friendlyError, parseUsername, removalResultMessage } from "@/lib/claim";
import { publicClient } from "@/lib/supabase/public";

export type RemoveState =
  | { step: "start"; error?: string; username?: string }
  | { step: "code"; code: BioCode; error?: string }
  | { step: "done"; message: string };

// No account needed (§9.4): the code in the Devpost bio is the proof, checked in the database.
export async function removeAction(prev: RemoveState, formData: FormData): Promise<RemoveState> {
  const supabase = publicClient();
  if (!supabase) return { step: "start", error: "Removal is unavailable right now. Try again in a minute." };

  if (formData.get("intent") === "verify" && prev.step === "code") {
    const { data, error } = await supabase.rpc("verify_removal", { p_username: prev.code.username, p_code: prev.code.code });
    if (error) return { ...prev, error: friendlyError(error) };
    const result = removalResultMessage(String(data));
    if (!result.ok) return { ...prev, error: result.message };
    updateTag("ratings");
    return { step: "done", message: result.message };
  }
  if (formData.get("intent") === "restart") return { step: "start" };

  const raw = String(formData.get("username") ?? "");
  const username = parseUsername(raw);
  if (!username) return { step: "start", error: "Enter your Devpost username, as in devpost.com/your-username.", username: raw };
  const { data, error } = await supabase.rpc("start_removal", { p_username: username });
  const row = data?.[0];
  if (error || !row) return { step: "start", error: friendlyError(error), username };
  return { step: "code", code: { code: row.code, expiresAt: row.expires_at, username: row.username, displayName: row.display_name } };
}
