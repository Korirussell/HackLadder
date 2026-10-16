"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { CORRECTION_KINDS, type CorrectionKind } from "./kinds";

export type CorrectionState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendCorrection(_prev: CorrectionState, formData: FormData): Promise<CorrectionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const person = String(formData.get("person") ?? "");
  if (!auth?.claims) redirect(`/sign-in?next=${encodeURIComponent(`/corrections/new?person=${person}`)}`);

  const kind = String(formData.get("kind") ?? "") as CorrectionKind;
  const details = String(formData.get("details") ?? "").trim().slice(0, 2000);
  const event = String(formData.get("event") ?? "").trim().slice(0, 200);
  if (!CORRECTION_KINDS.some((k) => k.value === kind)) return { status: "error", message: "Pick what's wrong." };
  if (details.length < 10) return { status: "error", message: "Say what's wrong in a sentence or two, so an admin can check it." };

  const { data: p } = await supabase.from("public_people").select("id").eq("slug", person).maybeSingle();
  if (!p?.id) return { status: "error", message: "That profile doesn't exist anymore." };
  const { error } = await supabase.from("corrections").insert({
    person_id: p.id,
    submitted_by: auth.claims.sub,
    kind,
    payload: { details, ...(event ? { event } : {}) },
  });
  if (error) return { status: "error", message: "The correction wasn't sent. Try again in a minute." };
  return { status: "sent", message: "Sent. An admin reviews corrections within a week; track it on your profile page." };
}
