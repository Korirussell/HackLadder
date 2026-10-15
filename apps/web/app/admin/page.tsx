import Link from "next/link";
import { Suspense } from "react";

import { Loading, PageHead } from "@/components/admin/page-head";
import { requireAdmin } from "@/lib/admin";

export default function AdminHome() {
  return (
    <>
      <PageHead title="Admin">
        Everything that decides how ratings work. Changes are logged and apply at the next rating run.
      </PageHead>
      <Suspense fallback={<Loading />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const { supabase, email } = await requireAdmin("/admin");
  const count = async (table: "prize_tier_rules" | "prize_tier_overrides" | "config_changes" | "rank_tiers") =>
    (await supabase.from(table).select("*", { count: "exact", head: true })).count ?? 0;
  const scopeCount = async (ratedOnly: boolean) => {
    const q = supabase.from("hackathon_scope").select("hackathon_id", { count: "exact", head: true });
    return (await (ratedOnly ? q.eq("is_rated", true) : q)).count ?? 0;
  };
  const [events, rated, rules, overrides, changes, rankTiers, lastChange] = await Promise.all([
    scopeCount(false),
    scopeCount(true),
    count("prize_tier_rules"),
    count("prize_tier_overrides"),
    count("config_changes"),
    count("rank_tiers"),
    supabase.from("config_changes").select("changed_at").order("changed_at", { ascending: false }).limit(1),
  ]);
  const cards = [
    { href: "/admin/events", stat: `${rated} of ${events}`, label: "events count toward ratings" },
    { href: "/admin/prizes", stat: `${rules} rules`, label: `and ${overrides} overrides decide prize tiers` },
    { href: "/admin/ranks", stat: `${rankTiers} tiers`, label: "rank bands, provisional and inactivity settings" },
    { href: "/admin/changes", stat: `${changes} changes`, label: lastChange.data?.[0] ? `last on ${new Date(lastChange.data[0].changed_at).toLocaleDateString("en-US", { dateStyle: "medium" })}` : "none yet" },
  ];

  return (
    <>
      <p className="text-[15px] text-graphite">Signed in as {email}.</p>
      <div className="mt-8 grid gap-5 min-[900px]:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="flex min-h-[180px] flex-col rounded-card bg-tile p-7 hover:bg-rule">
            <span className="stat mt-auto text-[48px] leading-none">{c.stat}</span>
            <span className="mt-2 text-[15px] text-graphite">{c.label}</span>
          </Link>
        ))}
      </div>
      {rules === 0 && (
        <p className="mt-8 max-w-[60ch]">
          No prize rules yet. Load the defaults with <code>uv run hl config seed</code> in <code>pipeline/</code>, then
          edit them here.
        </p>
      )}
      <p className="mt-10 max-w-[60ch] text-graphite">
        Recomputing ratings from this page arrives with the rating pipeline. Until then, changes are saved and logged, and
        the first rating run will use them.
      </p>
    </>
  );
}
