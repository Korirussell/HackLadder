import { Suspense } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Loading, PageHead } from "@/components/admin/page-head";
import { requireAdmin } from "@/lib/admin";
import type { PrizeRule } from "@/lib/prize-tiers";
import { ghostButton, input, label } from "@/lib/ui";

import { deleteOverride, deleteRule, moveRule, saveOverride } from "../actions";
import { type EditableRule, PrizeTester, RuleEditor } from "./rule-editor";

export default function PrizesAdmin() {
  return (
    <>
      <PageHead title="Prize tiers">
        Rules are checked top to bottom; the first match decides the tier. Anything no rule catches gets the default tier.
        Overrides fix one prize at one event.
      </PageHead>
      <Suspense fallback={<Loading />}>
        <PrizeRules />
      </Suspense>
    </>
  );
}

async function PrizeRules() {
  const { supabase } = await requireAdmin("/admin/prizes");
  const [{ data: rows, error }, { data: settings }, { data: overrides }] = await Promise.all([
    supabase.from("prize_tier_rules").select("*").order("position"),
    supabase.from("rating_settings").select("default_prize_tier").single(),
    supabase.from("prize_tier_overrides").select("*").order("updated_at", { ascending: false }),
  ]);
  if (error) throw new Error(`Couldn't load prize rules: ${error.message}`);
  const defaultTier = settings?.default_prize_tier ?? 2;
  const rules: EditableRule[] = (rows ?? []).map((r) => ({ ...r, match: r.match as PrizeRule["match"] }));
  const blank: EditableRule = { id: null, name: "", tier: 3, pattern: "", match: "stripped", examples: [], enabled: true };

  const eventIds = [...new Set((overrides ?? []).map((o) => o.hackathon_id))];
  const { data: events } = eventIds.length
    ? await supabase.from("hackathon_scope").select("hackathon_id, slug").in("hackathon_id", eventIds)
    : { data: [] };
  const slugOf = new Map((events ?? []).map((e) => [e.hackathon_id, e.slug]));

  return (
    <div className="grid gap-14">
      <PrizeTester rules={rules} defaultTier={defaultTier} />

      <section aria-labelledby="rules-head">
        <h2 id="rules-head" className="border-b border-ink pb-3 text-[28px] font-bold tracking-[-0.03em]">
          Rules <span className="text-muted">· default tier {defaultTier}</span>
        </h2>
        {rules.length === 0 && (
          <p className="mt-6">No rules yet. Load the defaults with <code>uv run hl config seed</code>, or add one below.</p>
        )}
        <ol className="mt-2">
          {rules.map((rule, i) => (
            <li key={rule.id} className="border-b border-line py-7">
              <div className="mb-4 flex flex-wrap items-center gap-4">
                <span className="numeral text-[44px]">{i + 1}</span>
                <span className="text-[20px] font-bold">{rule.name}</span>
                <span className="text-muted">tier {rule.tier}{rule.enabled === false ? " · disabled" : ""}</span>
                <span className="ml-auto flex gap-4">
                  <form action={moveRule}>
                    <input type="hidden" name="id" value={rule.id ?? ""} />
                    <input type="hidden" name="direction" value={-1} />
                    <button type="submit" className={ghostButton} disabled={i === 0}>Move up</button>
                  </form>
                  <form action={moveRule}>
                    <input type="hidden" name="id" value={rule.id ?? ""} />
                    <input type="hidden" name="direction" value={1} />
                    <button type="submit" className={ghostButton} disabled={i === rules.length - 1}>Move down</button>
                  </form>
                  <form action={deleteRule}>
                    <input type="hidden" name="id" value={rule.id ?? ""} />
                    <button type="submit" className={ghostButton}>Delete</button>
                  </form>
                </span>
              </div>
              <RuleEditor rule={rule} allRules={rules} defaultTier={defaultTier} />
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-card bg-chrome p-7">
          <h3 className="mb-4 text-[20px] font-bold">Add a rule</h3>
          <RuleEditor rule={blank} allRules={rules} defaultTier={defaultTier} />
        </div>
      </section>

      <section aria-labelledby="overrides-head">
        <h2 id="overrides-head" className="border-b border-ink pb-3 text-[28px] font-bold tracking-[-0.03em]">
          Overrides
        </h2>
        {overrides?.length ? (
          <ul>
            {overrides.map((o) => (
              <li key={`${o.hackathon_id}-${o.prize_name}`} className="flex flex-wrap items-baseline gap-4 border-b border-line py-4">
                <span className="stat text-[28px]">Tier {o.tier}</span>
                <span className="font-semibold">{o.prize_name}</span>
                <span className="text-muted">at {slugOf.get(o.hackathon_id) ?? `event #${o.hackathon_id}`}{o.note ? ` · ${o.note}` : ""}</span>
                <form action={deleteOverride} className="ml-auto">
                  <input type="hidden" name="hackathon_id" value={o.hackathon_id} />
                  <input type="hidden" name="prize_name" value={o.prize_name} />
                  <button type="submit" className={ghostButton}>Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-muted">No overrides. Add one when a specific prize deserves a different tier, like a sponsor challenge that was genuinely hard.</p>
        )}
        <ActionForm action={saveOverride} submitLabel="Add override" className="mt-6 grid gap-4 min-[800px]:grid-cols-[1fr_2fr_0.8fr_1.4fr]">
          <div>
            <label className={label} htmlFor="ov-event">Event (Devpost subdomain)</label>
            <input id="ov-event" name="event" placeholder="treehacks-2024" className={`${input} mt-1`} />
          </div>
          <div>
            <label className={label} htmlFor="ov-prize">Exact prize name</label>
            <input id="ov-prize" name="prize" placeholder="Intel: Best Use of Intel Developer Cloud (...)" className={`${input} mt-1`} />
          </div>
          <div>
            <label className={label} htmlFor="ov-tier">Tier</label>
            <select id="ov-tier" name="tier" defaultValue={3} className={`${input} mt-1`}>
              {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ov-note">Why</label>
            <input id="ov-note" name="note" placeholder="Judged by Intel engineers" className={`${input} mt-1`} />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
