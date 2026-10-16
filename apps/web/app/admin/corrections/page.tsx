import Link from "next/link";
import { Suspense } from "react";

import { reviewCorrection } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/action-form";
import { Loading, PageHead } from "@/components/admin/page-head";
import { requireAdmin } from "@/lib/admin";
import { input, label } from "@/lib/ui";

export default function CorrectionsAdmin() {
  return (
    <>
      <PageHead title="Corrections">
        What people say is wrong. Fix the input (prize overrides, event settings), then approve. Reviewed within a week.
      </PageHead>
      <Suspense fallback={<Loading />}>
        <Queue />
      </Suspense>
    </>
  );
}

async function Queue() {
  const { supabase } = await requireAdmin("/admin/corrections");
  const { data: rows, error } = await supabase
    .from("corrections")
    .select("id, person_id, kind, payload, status, created_at, note")
    .order("status", { ascending: false })
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`corrections: ${error.message}`);
  const ids = [...new Set((rows ?? []).map((r) => r.person_id))];
  const { data: people } = ids.length
    ? await supabase.from("public_people").select("id, slug, display_name").in("id", ids)
    : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p]));
  const pending = (rows ?? []).filter((r) => r.status === "pending");
  const done = (rows ?? []).filter((r) => r.status !== "pending");

  if (!rows?.length) return <p className="py-10 text-muted">No corrections yet.</p>;
  return (
    <div className="grid gap-5">
      <p className="text-[15px] text-muted">{pending.length} pending</p>
      {pending.map((c) => {
        const p = who.get(c.person_id);
        const payload = (c.payload ?? {}) as { details?: string; event?: string; school?: string };
        return (
          <article key={c.id} className="rounded-card border border-line bg-win p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[20px] font-bold">
                {c.kind.replaceAll("_", " ")} ·{" "}
                {p ? (
                  <Link href={`/h/${p.slug}`} className="underline">
                    {p.display_name}
                  </Link>
                ) : (
                  "hidden person"
                )}
              </h2>
              <span className="text-[14px] text-muted">{c.created_at.slice(0, 10)}</span>
            </div>
            {payload.event && <p className="mt-2 text-[15px]">Event: {payload.event}</p>}
            {payload.school && <p className="mt-2 text-[15px]">School: {payload.school}</p>}
            {payload.details && <p className="mt-2 whitespace-pre-line">{payload.details}</p>}
            {c.kind === "set_school" ? (
              <ActionForm action={reviewCorrection} submitLabel="Add school and approve" className="mt-4">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="decision" value="approve_school" />
                <label className={label}>
                  School name, as it should appear
                  <input name="school" defaultValue={payload.school ?? ""} className={`${input} mt-1`} />
                </label>
              </ActionForm>
            ) : null}
            <ActionForm action={reviewCorrection} submitLabel="Save decision" className="mt-4">
              <input type="hidden" name="id" value={c.id} />
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="approved" required /> approve
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="rejected" /> reject
                </label>
              </div>
              <label className={`${label} mt-3`}>
                Note for the person (optional)
                <input name="note" className={`${input} mt-1`} />
              </label>
            </ActionForm>
          </article>
        );
      })}
      {done.length > 0 && (
        <details className="rounded-card border border-line bg-win p-6">
          <summary className="cursor-pointer font-semibold">{done.length} reviewed</summary>
          <ul className="mt-3 grid gap-2 text-[15px]">
            {done.map((c) => (
              <li key={c.id}>
                {c.created_at.slice(0, 10)} · {c.kind.replaceAll("_", " ")} · {who.get(c.person_id)?.display_name ?? "hidden person"} ·{" "}
                <b>{c.status}</b>
                {c.note ? ` · ${c.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
