import { Suspense } from "react";

import { Loading, PageHead } from "@/components/admin/page-head";
import { requireAdmin } from "@/lib/admin";
import type { Json } from "@/lib/supabase/database.types";

const TABLE_NAMES: Record<string, string> = {
  rating_settings: "Settings",
  event_tiers: "Event tiers",
  hackathon_settings: "Event",
  prize_tier_rules: "Prize rule",
  prize_tier_overrides: "Prize override",
  rank_tiers: "Rank tier",
};
const IGNORED = new Set(["updated_at", "updated_by"]);

export default function ChangesAdmin() {
  return (
    <>
      <PageHead title="Change log">Every config change, newest first. The rating run also stores the exact config it used.</PageHead>
      <Suspense fallback={<Loading />}>
        <Changes />
      </Suspense>
    </>
  );
}

function diff(oldRow: Json | null, newRow: Json | null): string {
  const o = (oldRow ?? {}) as Record<string, Json>;
  const n = (newRow ?? {}) as Record<string, Json>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !IGNORED.has(k));
  const show = (v: Json | undefined) => (v === undefined || v === null ? "none" : JSON.stringify(v));
  if (!oldRow) return keys.map((k) => `${k}: ${show(n[k])}`).join(" · ");
  if (!newRow) return keys.map((k) => `${k}: ${show(o[k])}`).join(" · ");
  return keys
    .filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => `${k}: ${show(o[k])} → ${show(n[k])}`)
    .join(" · ");
}

async function Changes() {
  const { supabase } = await requireAdmin("/admin/changes");
  const { data, error } = await supabase
    .from("config_changes")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Couldn't load the change log: ${error.message}`);
  if (!data.length) return <p className="mt-8">No changes yet.</p>;

  return (
    <ol className="border-t border-line">
      {data.map((c) => (
        <li key={c.id} className="grid gap-1 border-b border-line py-4 min-[900px]:grid-cols-[180px_160px_1fr]">
          <time dateTime={c.changed_at} className="text-[14px] text-muted">
            {new Date(c.changed_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </time>
          <span className="font-semibold">
            {TABLE_NAMES[c.table_name] ?? c.table_name} {c.operation === "INSERT" ? "added" : c.operation === "DELETE" ? "removed" : "changed"}
          </span>
          <span className="text-[15px] break-words">
            {diff(c.old_row, c.new_row) || "no visible change"}
            {!c.changed_by && <span className="text-muted"> · by the pipeline</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
