import Link from "next/link";
import { Suspense } from "react";

import { Loading, PageHead } from "@/components/admin/page-head";
import { RecomputeButton } from "@/components/admin/recompute-button";
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
      <p className="text-[15px] text-muted">Signed in as {email}.</p>
      <div className="mt-8 grid gap-5 min-[900px]:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="flex min-h-[180px] flex-col rounded-card bg-chrome p-7 hover:bg-line">
            <span className="stat mt-auto text-[48px] leading-none">{c.stat}</span>
            <span className="mt-2 text-[15px] text-muted">{c.label}</span>
          </Link>
        ))}
      </div>
      {rules === 0 && (
        <p className="mt-8 max-w-[60ch]">
          No prize rules yet. Load the defaults with <code>uv run hl config seed</code> in <code>pipeline/</code>, then
          edit them here.
        </p>
      )}
      <section aria-labelledby="runs-head" className="mt-14">
        <h2 id="runs-head" className="border-b border-ink pb-3 text-[28px] font-bold tracking-[-0.03em]">
          Pipeline runs
        </h2>
        <p className="mt-3 max-w-[70ch] text-muted">
          Ratings rebuild nightly and after every Monday crawl. Recompute now to apply config changes immediately.
        </p>
        <div className="mt-5">
          <RecomputeButton />
        </div>
        <RecentRuns />
      </section>
    </>
  );
}

async function RecentRuns() {
  const { supabase } = await requireAdmin("/admin");
  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select("id, job, status, started_at, finished_at, pages_fetched, people_rated, summary")
    .order("started_at", { ascending: false })
    .limit(10);
  if (!runs?.length) return <p className="mt-6 text-muted">No runs yet.</p>;
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return (
    <ul className="mt-6 border-t border-line">
      {runs.map((r) => (
        <li key={r.id} className="grid gap-1 border-b border-line py-3 text-[15px] min-[900px]:grid-cols-[200px_160px_120px_1fr]">
          <time dateTime={r.started_at} className="text-muted">{when(r.started_at)}</time>
          <span className="font-semibold">{r.job}</span>
          <span className={r.status === "failed" ? "font-bold" : "text-muted"}>{r.status}</span>
          <span className="text-muted break-words">
            {r.people_rated ? `${r.people_rated} people rated` : r.pages_fetched ? `${r.pages_fetched} requests` : ""}
            {r.status === "failed" && r.summary && typeof r.summary === "object" && "error" in r.summary
              ? ` · ${String((r.summary as { error: unknown }).error).slice(0, 160)}`
              : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
