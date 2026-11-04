"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { asPage, type HackerPage } from "@/lib/pages";
import { cleanBio, cleanUrl } from "@/lib/profile";
import { cleanLayout } from "@/lib/profile-layout";
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
  return { status: "saved", message: isTheme(theme) ? "Visitors now see your profile and share card in this theme." : "Your profile follows each visitor's device again." };
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

// ---------------------------------------------------------------- profile layout (migration 20261021000100)

/** Saves the trophy order, pinned and hidden projects and project layout, checked against the owner's own data. */
export async function saveLayout(input: unknown): Promise<FormState> {
  const { supabase, me } = await owner();
  // Fresh, not the cached page: the keys and ids an owner may arrange are exactly what they have now.
  const { data, error: readError } = await supabase.rpc("hacker_page", { p_slug: me.slug });
  const page = asPage<HackerPage>(data);
  if (readError || !page) return { status: "error", message: "Make your profile public to arrange it." };
  const cleaned = cleanLayout(input, {
    trophyKeys: (page.trophies ?? []).map((t) => t.key),
    projectIds: page.events.map((e) => e.project_id),
  });
  if (!cleaned.ok) return { status: "error", message: cleaned.error };
  const { error } = await supabase.from("people").update({ profile_layout: cleaned.layout }).eq("id", me.id);
  if (error) return { status: "error", message: "Your layout wasn't saved. Try again in a minute." };
  refresh(me.slug);
  return { status: "saved", message: "Saved. Your profile shows it now." };
}

// ---------------------------------------------------------------- photo (§9.2: claimed owners only)
const PHOTO_MAX_BYTES = 1024 * 1024;
const PHOTO_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/webp": { ext: "webp", magic: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && ascii(b, 1, 4) === "PNG" },
};
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/** Uploads a new photo into the owner's own folder and points the profile at it. */
export async function uploadPhoto(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, me } = await owner();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Pick a photo first." };
  const kind = PHOTO_TYPES[file.type];
  if (!kind) return { status: "error", message: "Use a JPEG, PNG or WebP photo." };
  if (file.size > PHOTO_MAX_BYTES) return { status: "error", message: "That photo is over 1 MB. Try a smaller one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!kind.magic(bytes)) return { status: "error", message: "That file isn't the image it says it is." };

  const path = `${me.id}/${crypto.randomUUID().replaceAll("-", "")}.${kind.ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (uploadError) return { status: "error", message: "The photo didn't upload. Try again in a minute." };

  const { data: before } = await supabase.from("people").select("avatar_path").eq("id", me.id).single();
  const { error } = await supabase.from("people").update({ avatar_path: path }).eq("id", me.id);
  if (error) {
    await supabase.storage.from("avatars").remove([path]);
    return { status: "error", message: "The photo wasn't saved. Try again in a minute." };
  }
  if (before?.avatar_path) await supabase.storage.from("avatars").remove([before.avatar_path]);
  refresh(me.slug);
  return { status: "saved", message: "Photo updated." };
}

export async function removePhoto(): Promise<FormState> {
  const { supabase, me } = await owner();
  const { data: before } = await supabase.from("people").select("avatar_path").eq("id", me.id).single();
  const { error } = await supabase.from("people").update({ avatar_path: null }).eq("id", me.id);
  if (error) return { status: "error", message: "That didn't save. Try again in a minute." };
  if (before?.avatar_path) await supabase.storage.from("avatars").remove([before.avatar_path]);
  refresh(me.slug);
  return { status: "saved", message: "Photo removed. Your profile shows your initials." };
}

// ---------------------------------------------------------------- school search
export async function searchSchools(q: string): Promise<{ id: number; name: string; country: string | null }[]> {
  if (typeof q !== "string" || q.trim().length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_schools", { q: q.slice(0, 100), lim: 12 });
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, country: s.country }));
}
