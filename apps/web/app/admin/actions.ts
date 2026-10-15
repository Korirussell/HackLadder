"use server";

import { refresh } from "next/cache";

import { requireAdmin } from "@/lib/admin";
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
export async function confirmMlhMatch(_prev: FormState, f: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin("/admin/mlh");
  const mlhEventId = int(f, "mlh_event_id");
  const slug = text(f, "slug").toLowerCase();
  let hackathonId = f.get("hackathon_id") ? int(f, "hackathon_id") : null;
  if (slug) {
    const { data: event } = await supabase.from("hackathon_scope").select("hackathon_id").eq("slug", slug).maybeSingle();
    if (!event?.hackathon_id) return fail(`No Devpost event "${slug}". Use its subdomain, e.g. hackgt-11.`);
    hackathonId = event.hackathon_id;
  }
  if (!hackathonId) return fail("Enter the Devpost subdomain of the matching event.");
  const { error } = await supabase.from("mlh_event_matches").upsert({
    mlh_event_id: mlhEventId,
    hackathon_id: hackathonId,
    status: "confirmed",
    note: optionalText(f, "note") ?? "confirmed by an admin",
  });
  if (error) return fail(`Not saved: ${error.message}`);
  refresh();
  return OK;
}

export async function rejectMlhMatch(f: FormData) {
  const { supabase } = await requireAdmin("/admin/mlh");
  const { error } = await supabase.from("mlh_event_matches").upsert({
    mlh_event_id: int(f, "mlh_event_id"),
    hackathon_id: null,
    status: "rejected",
    note: "no Devpost event (admin)",
  });
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  refresh();
}
