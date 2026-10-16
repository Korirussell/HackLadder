import { Suspense } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Loading, PageHead } from "@/components/admin/page-head";
import { requireAdmin } from "@/lib/admin";
import { input, label } from "@/lib/ui";

import { saveRankTier, saveSettings } from "../actions";

export default function RanksAdmin() {
  return (
    <>
      <PageHead title="Ranks and settings">
        Rank tiers are names for bands of the leaderboard. They change how ranks are shown, never the ratings themselves.
      </PageHead>
      <Suspense fallback={<Loading />}>
        <RankTiers />
      </Suspense>
    </>
  );
}

async function RankTiers() {
  const { supabase } = await requireAdmin("/admin/ranks");
  const [{ data: tiers, error }, { data: settings }] = await Promise.all([
    supabase.from("rank_tiers").select("*").order("position"),
    supabase.from("rating_settings").select("*").single(),
  ]);
  if (error) throw new Error(`Couldn't load rank tiers: ${error.message}`);

  return (
    <div className="grid gap-14">
      <section aria-labelledby="tiers-head">
        <h2 id="tiers-head" className="border-b border-ink pb-3 text-[28px] font-bold tracking-[-0.03em]">Rank tiers</h2>
        <p className="mt-3 max-w-[70ch] text-muted">
          Among non-provisional hackers, highest first. A top-N title (Hall of Fame) beats percentile bands; the last tier
          is everyone else.
        </p>
        <ol>
          {tiers?.map((t) => {
            const kind = t.top_n !== null ? "top_n" : t.top_percent !== null ? "percent" : "floor";
            return (
              <li key={t.id} className="border-b border-line py-6">
                <ActionForm action={saveRankTier} submitLabel="Save" className="grid items-end gap-4 min-[800px]:grid-cols-[2fr_1.4fr_1fr]">
                  <input type="hidden" name="id" value={t.id} />
                  <div>
                    <label className={label} htmlFor={`rt-name-${t.id}`}>Name</label>
                    <input id={`rt-name-${t.id}`} name="name" defaultValue={t.name} className={`${input} mt-1 text-[20px] font-bold`} />
                  </div>
                  <div>
                    <label className={label} htmlFor={`rt-kind-${t.id}`}>Who gets it</label>
                    <select id={`rt-kind-${t.id}`} name="kind" defaultValue={kind} className={`${input} mt-1`}>
                      <option value="top_n">Top N overall</option>
                      <option value="percent">Top % of rated hackers</option>
                      <option value="floor">Everyone else</option>
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor={`rt-value-${t.id}`}>N or %</label>
                    <input id={`rt-value-${t.id}`} name="value" type="number" step="0.01" min="0"
                      defaultValue={t.top_n ?? t.top_percent ?? ""} className={`${input} mt-1`} />
                  </div>
                </ActionForm>
              </li>
            );
          })}
        </ol>
      </section>

      {settings && (
        <section aria-labelledby="settings-head">
          <h2 id="settings-head" className="border-b border-ink pb-3 text-[28px] font-bold tracking-[-0.03em]">Settings</h2>
          <ActionForm action={saveSettings} submitLabel="Save settings" className="mt-6 grid max-w-[720px] gap-5">
            <div className="grid gap-5 min-[700px]:grid-cols-3">
              <div>
                <label className={label} htmlFor="provisional">Events before a hacker is ranked</label>
                <input id="provisional" name="provisional_min_events" type="number" min={1} defaultValue={settings.provisional_min_events} className={`${input} mt-1`} />
              </div>
              <div>
                <label className={label} htmlFor="inactive">Months until off the live board</label>
                <input id="inactive" name="inactive_after_months" type="number" min={1} defaultValue={settings.inactive_after_months} className={`${input} mt-1`} />
              </div>
              <div>
                <label className={label} htmlFor="default-tier">Default prize tier</label>
                <select id="default-tier" name="default_prize_tier" defaultValue={settings.default_prize_tier} className={`${input} mt-1`}>
                  {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="mlh_digital_counts" defaultChecked={settings.mlh_digital_counts} />
              MLH online events (Global Hack Week and similar) count automatically
            </label>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
