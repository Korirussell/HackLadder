"use server";

import { updateTag } from "next/cache";

import { type BioCode, claimResultMessage, friendlyError, parseUsername } from "@/lib/claim";
import { createClient } from "@/lib/supabase/server";

export type ClaimState =
  | { step: "start"; error?: string; username?: string }
  | { step: "code"; attemptId: number; code: BioCode; error?: string; checking?: boolean }
  | { step: "done"; message: string; slug: string | null };

async function startClaim(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const raw = String(formData.get("username") ?? "");
  const username = parseUsername(raw);
  if (!username) return { step: "start", error: "Enter your Devpost username, as in devpost.com/your-username.", username: raw };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_claim", { p_username: username });
  const row = data?.[0];
  if (error || !row) return { step: "start", error: friendlyError(error), username };
  return {
    step: "code",
    attemptId: row.attempt_id,
    code: { code: row.code, expiresAt: row.expires_at, username: row.username, displayName: row.display_name },
  };
}

async function verifyClaim(prev: ClaimState, formData: FormData): Promise<ClaimState> {
  if (prev.step !== "code") return prev;
  const attemptId = Number(formData.get("attempt"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_claim", { p_attempt_id: attemptId });
  if (error) return { ...prev, error: friendlyError(error) };
  const result = claimResultMessage(String(data));
  if (!result.ok) return { ...prev, error: result.message };

  const { data: me } = await supabase.from("people").select("slug").maybeSingle();
  // Claimed badges, links and merged results show on profiles and boards: refresh them all.
  updateTag("ratings");
  return { step: "done", message: result.message, slug: me?.slug ?? null };
}

/** Resume an open code from the list on /claim. */
async function resumeClaim(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const attemptId = Number(formData.get("attempt"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_claim_attempts");
  const row = data?.find((a) => a.attempt_id === attemptId);
  if (error || !row) return { step: "start", error: "That code expired. Get a new one." };
  return {
    step: "code",
    attemptId: row.attempt_id,
    code: { code: row.code, expiresAt: row.expires_at, username: row.username, displayName: row.display_name },
  };
}

/** One entry point for the claim form: the submit button's intent picks the step. */
export async function claimAction(prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const intent = formData.get("intent");
  if (intent === "verify") return verifyClaim(prev, formData);
  if (intent === "resume") return resumeClaim(prev, formData);
  if (intent === "restart") return { step: "start" };
  return startClaim(prev, formData);
}
