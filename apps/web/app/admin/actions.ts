"use server";

import { refresh } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { nearestFirst, type PriorMatch, searchPattern } from "@/lib/mlh-review";
import { type PrizeRule, validateRule } from "@/lib/prize-tiers";
import { type RankTierRow, validateRankTiers } from "@/lib/rank-tiers";

export type FormState = { ok: boolean; errors: string[] };
const OK: FormState = { ok: true, errors: [] };
const fail = (...errors: string[]): FormState => ({ ok: false, errors });

const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const optionalText = (f: FormData, key: string) => text(f, key) || null;
const int = (f: FormData, key: string) => Number.parseInt(text(f, key), 10);

// ---------------------------------------------------------------- events
export async function saveHackathonSetting(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin("/admin/events");
  const counts = text(f, "counts");
  if (!["auto", "include", "exclude"].includes(counts)) return fail("Pick auto, include or exclude.");
  const { error } = await supabase.from("hackathon_settings").upsert({
    hackathon_id: int(f, "hackathon_id"),
    counts: counts as "auto" | "include" | "exclude",
    event_tier: optionalText(f, "event_tier"),
    note: optionalText(f, "note"),
  });
  if (error) return fail(`Not saved: ${error.message}`);
  refresh();
  return OK;
}

// ---------------------------------------------------------------- prize rules
async function currentRules() {
  const { supabase } = await requireAdmin("/admin/prizes");
  const [{ data: rules, error }, { data: settings }] = await Promise.all([
    supabase.from("prize_tier_rules").select("*").order("position"),
    supabase.from("rating_settings").select("default_prize_tier").single(),
  ]);
  if (error) throw new Error(`Couldn't load prize rules: ${error.message}`);
  return { supabase, rules: rules ?? [], defaultTier: settings?.default_prize_tier ?? 2 };
}

export async function saveRule(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase, rules, defaultTier } = await currentRules();
  const id = f.get("id") ? int(f, "id") : null;
  const rule: PrizeRule = {
    name: text(f, "name"),
    tier: int(f, "tier"),
    pattern: text(f, "pattern"),
    match: text(f, "match") === "full" ? "full" : "stripped",
    examples: text(f, "examples")
      .split("\n")
      .map((e) => e.trim())
      .filter(Boolean),
    enabled: f.get("enabled") === "on",
  };
  // Validate against the rule set as it will be after this save.
  const after: PrizeRule[] = rules.map((r) => (r.id === id ? rule : { ...r, match: r.match as PrizeRule["match"] }));
  if (id === null) after.push(rule);
  const problems = validateRule(rule, after, defaultTier);
  if (problems.length) return fail(...problems);

  const row = { ...rule, enabled: rule.enabled ?? true };
  const { error } =
    id === null
      ? await supabase
          .from("prize_tier_rules")
          .insert({ ...row, position: Math.max(0, ...rules.map((r) => r.position)) + 1 })
      : await supabase.from("prize_tier_rules").update(row).eq("id", id);
  if (error) return fail(error.code === "23505" ? "Another rule already has that name." : `Not saved: ${error.message}`);
  refresh();
  return OK;
}

export async function moveRule(f: FormData) {
  const { supabase } = await requireAdmin("/admin/prizes");
  const { error } = await supabase.rpc("move_prize_rule", {
    rule_id: int(f, "id"),
    direction: int(f, "direction"),
  });
  if (error) throw new Error(`Couldn't move the rule: ${error.message}`);
  refresh();
}

export async function deleteRule(f: FormData) {
  const { supabase } = await requireAdmin("/admin/prizes");
  const { error } = await supabase.from("prize_tier_rules").delete().eq("id", int(f, "id"));
  if (error) throw new Error(`Couldn't delete the rule: ${error.message}`);
  refresh();
}

// ---------------------------------------------------------------- prize overrides
export async function saveOverride(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin("/admin/prizes");
  const slug = text(f, "event").toLowerCase();
  const prize = text(f, "prize");
  const tier = int(f, "tier");
  if (!slug || !prize) return fail("Fill in the event and the exact prize name.");
  if (!(tier >= 1 && tier <= 5)) return fail("Tier must be 1 to 5.");
  const { data: event } = await supabase.from("hackathon_scope").select("hackathon_id").eq("slug", slug).maybeSingle();
  if (!event?.hackathon_id) return fail(`No hackathon "${slug}" yet. Use its Devpost subdomain, e.g. treehacks-2024.`);
  const { error } = await supabase
    .from("prize_tier_overrides")
    .upsert({ hackathon_id: event.hackathon_id, prize_name: prize, tier, note: optionalText(f, "note") });
  if (error) return fail(`Not saved: ${error.message}`);
  refresh();
  return OK;
}

export async function deleteOverride(f: FormData) {
  const { supabase } = await requireAdmin("/admin/prizes");
  const { error } = await supabase
    .from("prize_tier_overrides")
    .delete()
    .eq("hackathon_id", int(f, "hackathon_id"))
    .eq("prize_name", text(f, "prize_name"));
  if (error) throw new Error(`Couldn't delete the override: ${error.message}`);
  refresh();
}

// ---------------------------------------------------------------- rank tiers and settings
export async function saveRankTier(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin("/admin/ranks");
  const id = int(f, "id");
  const kind = text(f, "kind");
  const value = Number(text(f, "value"));
  const patch: Omit<RankTierRow, "position"> = {
    name: text(f, "name"),
    top_percent: kind === "percent" ? value : null,
    top_n: kind === "top_n" ? value : null,
  };
  const { data: rows, error: loadError } = await supabase.from("rank_tiers").select("*");
  if (loadError) return fail(`Couldn't load rank tiers: ${loadError.message}`);
  const after = (rows ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r));
  const problems = validateRankTiers(after);
  if (problems.length) return fail(...problems);

  const { error } = await supabase.from("rank_tiers").update(patch).eq("id", id);
  if (error) return fail(error.code === "23505" ? "Another tier already has that name." : `Not saved: ${error.message}`);
  refresh();
  return OK;
}

export async function saveSettings(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin("/admin/ranks");
  const settings = {
    default_prize_tier: int(f, "default_prize_tier"),
    provisional_min_events: int(f, "provisional_min_events"),
    inactive_after_months: int(f, "inactive_after_months"),
    mlh_digital_counts: f.get("mlh_digital_counts") === "on",
  };
  if (!(settings.default_prize_tier >= 1 && settings.default_prize_tier <= 5)) return fail("Default tier must be 1 to 5.");
  if (!(settings.provisional_min_events >= 1)) return fail("Provisional threshold must be at least 1 event.");
  if (!(settings.inactive_after_months >= 1)) return fail("Inactive-after must be at least 1 month.");
  const { error } = await supabase.from("rating_settings").update(settings).eq("id", true);
  if (error) return fail(`Not saved: ${error.message}`);
  refresh();
  return OK;
}

// ---------------------------------------------------------------- MLH matches
// Called from the review queue (app/admin/mlh/review-queue.tsx) with plain values, not forms,
// so a batch of decisions is one request. Inputs come from the browser: validate everything.
export type MlhDecision = { mlhEventId: number; hackathonId: number | null };
export type MlhResult = { ok: true; notice?: string } | { ok: false; error: string };
export type DevpostSearchResult = { hackathon_id: number; slug: string; title: string; ends_on: string | null };

const MAX_BATCH = 1000;
const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

/** Confirms each MLH event's Devpost match, or records that it has none (hackathonId null). */
export async function decideMlhMatches(decisions: MlhDecision[]): Promise<MlhResult> {
  const { supabase } = await requireAdmin("/admin/mlh");
  if (!Array.isArray(decisions) || decisions.length === 0 || decisions.length > MAX_BATCH) {
    return { ok: false, error: `Send 1 to ${MAX_BATCH} decisions.` };
  }
  if (!decisions.every((d) => isId(d?.mlhEventId) && (d.hackathonId === null || isId(d.hackathonId)))) {
    return { ok: false, error: "Some decisions weren't valid ids." };
  }
  const rows = decisions.map((d) =>
    d.hackathonId === null
      ? { mlh_event_id: d.mlhEventId, hackathon_id: null, status: "rejected", note: "no Devpost event (admin)" }
      : { mlh_event_id: d.mlhEventId, hackathon_id: d.hackathonId, status: "confirmed", note: "confirmed by an admin" },
  );
  const { error } = await supabase.from("mlh_event_matches").upsert(rows);
  if (error) return { ok: false, error: `Not saved: ${error.message}` };
  refresh();
  const confirmed = decisions.flatMap((d) => (d.hackathonId === null ? [] : [d.hackathonId]));
  return { ok: true, notice: confirmed.length ? await crawlConfirmed(supabase, confirmed) : undefined };
}

const MAX_CRAWL_SLUGS = 100; // the rest wait for the weekly crawl

/** Starts a crawl of the confirmed events that have ended and now count, so they don't wait a week. */
async function crawlConfirmed(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], ids: number[]) {
  const { data, error } = await supabase
    .from("hackathon_scope")
    .select("slug")
    .in("hackathon_id", ids)
    .eq("is_rated", true)
    .lt("ends_on", new Date().toISOString().slice(0, 10));
  if (error) return `Couldn't start a crawl (${error.message}); the weekly crawl will pick them up.`;
  const slugs = (data ?? []).flatMap((r) => (r.slug ? [r.slug] : [])).slice(0, MAX_CRAWL_SLUGS);
  if (!slugs.length) return undefined;
  const started = await dispatchWorkflow(CRAWL_WORKFLOW, { slugs: slugs.join(" ") });
  const what = slugs.length === 1 ? slugs[0] : `${slugs.length} events`;
  return started.ok
    ? `Crawling ${what}, then recomputing ratings (GitHub Actions).`
    : `Not crawled yet: ${started.errors[0]} The weekly crawl will pick it up.`;
}

const PRIOR_STATUSES = new Set<PriorMatch["status"]>(["auto", "suggested", "unmatched", "confirmed", "rejected"]);

/** Puts rows back the way they were before a batch of decisions (the queue's Undo). */
export async function undoMlhDecisions(prior: PriorMatch[]): Promise<MlhResult> {
  const { supabase } = await requireAdmin("/admin/mlh");
  if (!Array.isArray(prior) || prior.length === 0 || prior.length > MAX_BATCH) {
    return { ok: false, error: "Nothing to undo." };
  }
  const valid = prior.every(
    (p) =>
      isId(p?.mlh_event_id) &&
      (p.hackathon_id === null || isId(p.hackathon_id)) &&
      (p.score === null || Number.isFinite(p.score)) &&
      (p.note === null || typeof p.note === "string") &&
      PRIOR_STATUSES.has(p.status),
  );
  if (!valid) return { ok: false, error: "Couldn't undo: the saved state wasn't valid." };
  const rows = prior.map(({ mlh_event_id, hackathon_id, score, status, note }) => ({
    mlh_event_id,
    hackathon_id,
    score,
    status,
    note,
  }));
  const { error } = await supabase.from("mlh_event_matches").upsert(rows);
  if (error) return { ok: false, error: `Couldn't undo: ${error.message}` };
  refresh();
  return { ok: true };
}

/** Devpost events whose title or subdomain contains every word of `q`, nearest `near` first. */
export async function searchDevpostEvents(
  q: string,
  near: string | null,
): Promise<{ results: DevpostSearchResult[]; error?: string }> {
  const { supabase } = await requireAdmin("/admin/mlh");
  const pattern = typeof q === "string" ? searchPattern(q) : null;
  if (!pattern) return { results: [] };
  const columns = "hackathon_id, slug, title, ends_on";
  const [byTitle, bySlug] = await Promise.all([
    supabase.from("hackathon_scope").select(columns).ilike("title", pattern).limit(60),
    supabase.from("hackathon_scope").select(columns).ilike("slug", pattern).limit(60),
  ]);
  const error = byTitle.error ?? bySlug.error;
  if (error) return { results: [], error: `Search failed: ${error.message}` };
  const seen = new Set<number>();
  const results: DevpostSearchResult[] = [];
  for (const r of [...(byTitle.data ?? []), ...(bySlug.data ?? [])]) {
    if (r.hackathon_id === null || seen.has(r.hackathon_id)) continue;
    seen.add(r.hackathon_id);
    results.push({ hackathon_id: r.hackathon_id, slug: r.slug ?? "", title: r.title ?? r.slug ?? "", ends_on: r.ends_on });
  }
  return { results: nearestFirst(results, typeof near === "string" ? near : null) };
}

// ---------------------------------------------------------------- recompute
const RATE_WORKFLOW = "rate-nightly.yml";
const CRAWL_WORKFLOW = "crawl-events.yml";

/** Starts a GitHub Actions workflow on main. Needs GITHUB_DISPATCH_TOKEN (server-only). */
async function dispatchWorkflow(workflow: string, inputs?: Record<string, string>): Promise<FormState> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY ?? "Korirussell/HackLadder";
  if (!token) {
    return fail("GitHub Actions isn't connected: set GITHUB_DISPATCH_TOKEN (a fine-grained token with Actions: write).");
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", ...(inputs && { inputs }) }),
  });
  if (res.status !== 204) return fail(`GitHub didn't start the run (HTTP ${res.status}): ${await res.text()}`);
  return OK;
}

/** Starts the Rate workflow on GitHub Actions. */
export async function requestRecompute(): Promise<FormState> {
  await requireAdmin("/admin");
  const started = await dispatchWorkflow(RATE_WORKFLOW);
  if (!started.ok) return fail(`${started.errors[0]} Until then, run \`uv run hl rate\` in pipeline/.`);
  refresh();
  return OK;
}

// ---------------------------------------------------------------- corrections (§9.5)
// Approving records the decision; the input change itself is made by the admin (prize
// overrides, event settings) or, for a school, by approve_school_correction().
export async function reviewCorrection(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase, userId } = await requireAdmin("/admin/corrections");
  const id = int(f, "id");
  const decision = text(f, "decision");
  const note = optionalText(f, "note");
  if (decision === "approve_school") {
    const school = text(f, "school");
    if (!school) return fail("Give the school's name.");
    const { error } = await supabase.rpc("approve_school_correction", { p_correction_id: id, p_school_name: school });
    if (error) return fail(`Not saved: ${error.message}`);
    refresh();
    return OK;
  }
  if (decision !== "approved" && decision !== "rejected") return fail("Approve or reject it.");
  const { error } = await supabase
    .from("corrections")
    .update({ status: decision, reviewer: userId, reviewed_at: new Date().toISOString(), note })
    .eq("id", id);
  if (error) return fail(`Not saved: ${error.message}`);
  refresh();
  return OK;
}
