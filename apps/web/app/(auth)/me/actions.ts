"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { cleanBio, cleanUrl } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { isTheme } from "@/lib/theme";

export type FormState = { status: "idle" | "saved" | "error"; message?: string };

/** The caller's claimed profile, or a redirect: owners can only ever touch their own row (RLS). */
async function owner() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/sign-in?next=/me");
  const { data: me } = await supabase.from("people").select("id, slug").maybeSingle();
  if (!me) redirect("/claim");
  return { supabase, me, userId: auth.claims.sub };
}

function refresh(slug: string) {
  updateTag(`hacker:${slug}`);
}

export async function saveDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, me } = await owner();
  const fields = {
    github_url: cleanUrl(String(formData.get("github") ?? ""), "GitHub", ["github.com"]),
    linkedin_url: cleanUrl(String(formData.get("linkedin") ?? ""), "LinkedIn", ["linkedin.com"]),
    website_url: cleanUrl(String(formData.get("website") ?? ""), "Website"),
    bio: cleanBio(String(formData.get("bio") ?? "")),
  };
  const value = (f: (typeof fields)[keyof typeof fields]) => (f.ok ? f.value : null);
  const bad = Object.values(fields).find((f) => !f.ok);
  if (bad && !bad.ok) return { status: "error", message: bad.error };
  const { error } = await supabase
    .from("people")
    .update({
      github_url: value(fields.github_url),
      linkedin_url: value(fields.linkedin_url),
      website_url: value(fields.website_url),
      bio: value(fields.bio),
    })
    .eq("id", me.id);
  if (error) return { status: "error", message: "Your changes weren't saved. Try again in a minute." };
  refresh(me.slug);
  return { status: "saved", message: "Saved." };
}

export async function saveProfileTheme(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, me } = await owner();
  const theme = String(formData.get("theme") ?? "");
  const { error } = await supabase
    .from("people")
    .update({ profile_theme: isTheme(theme) ? theme : null })
    .eq("id", me.id);
  if (error) return { status: "error", message: "The theme wasn't saved. Try again in a minute." };
  refresh(me.slug);
  return { status: "saved", message: isTheme(theme) ? "Visitors now see your profile and share card in this theme." : "Your profile follows each visitor's theme again." };
}

export async function saveSchool(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, me, userId } = await owner();
  const schoolId = Number(formData.get("school_id"));
  const requested = String(formData.get("new_school") ?? "").trim().slice(0, 120);

  if (requested) {
    // A school we don't list yet goes to an admin, who creates it once (§16: no inference).
    const { error } = await supabase
      .from("corrections")
      .insert({ person_id: me.id, submitted_by: userId, kind: "set_school", payload: { school: requested } });
    if (error) return { status: "error", message: "The request wasn't sent. Try again in a minute." };
    return { status: "saved", message: `Requested "${requested}". An admin adds new schools within a week.` };
  }
  const { error } = await supabase
    .from("people")
    .update({ school_id: Number.isInteger(schoolId) && schoolId > 0 ? schoolId : null })
    .eq("id", me.id);
  if (error) return { status: "error", message: "Your school wasn't saved. Try again in a minute." };
  refresh(me.slug);
  updateTag("ratings");
  return { status: "saved", message: "Saved. School boards update at the next rating run." };
}

export async function setHidden(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, me } = await owner();
  const hidden = formData.get("hidden") === "true";
  const { error } = await supabase.from("people").update({ hidden }).eq("id", me.id);
  if (error) return { status: "error", message: "That didn't save. Try again in a minute." };
  refresh(me.slug);
  updateTag("ratings");
  return {
    status: "saved",
    message: hidden
      ? "Your profile is hidden everywhere. Your results still count for others, as Hidden hacker."
      : "Your profile is public again.",
  };
}
