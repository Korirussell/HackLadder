"use server";

import { redirect } from "next/navigation";

import { asUsername } from "@/lib/add";
import { dispatchWorkflow } from "@/lib/github";
import { publicClient } from "@/lib/supabase/public";

/** `username` is what was typed, so the form can show it again after an error (React resets it). */
export type AddFormState = { error: string | null; username?: string };

/** Records an add-me request and starts the lookup (spec 2026-10-29-find-yourself). */
export async function requestAdd(_prev: AddFormState, form: FormData): Promise<AddFormState> {
  const typed = String(form.get("username") ?? "").slice(0, 200);
  const username = asUsername(typed);
  if (!username) return { error: "That isn't a Devpost username. Use the part after devpost.com/ (letters, numbers, - and _).", username: typed };
  const supabase = publicClient();
  if (!supabase) return { error: "HackLadder can't take requests right now. Try again later.", username: typed };
  const { data, error } = await supabase.rpc("request_add", { p_username: username });
  if (error) {
    return {
      error: error.message.includes("add_requests_busy") ? "Lots of requests today. Try again tomorrow." : "Something went wrong. Try again in a minute.",
      username: typed,
    };
  }
  if (data?.[0]?.is_new) {
    // If GitHub doesn't start it, the daily crawl looks up waiting requests before it runs.
    const started = await dispatchWorkflow("add-hacker.yml", { username });
    if (!started.ok) console.error(`add-hacker dispatch for ${username}: ${started.error}`);
  }
  redirect(`/add/${encodeURIComponent(username)}`);
}
