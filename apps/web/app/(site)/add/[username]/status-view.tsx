"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/site/bits";
import { Win } from "@/components/os/window";
import { type AddRequest, EVENT_STATE_LABEL, isFinished, POLL_FOR_MS, POLL_MS, statusCopy } from "@/lib/add";

/** An add-me request, re-checked every few seconds until the pipeline is done with it. */
export function AddStatusView({ initial }: { initial: AddRequest }) {
  const [r, setR] = useState(initial);
  useEffect(() => {
    if (isFinished(r.status)) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_FOR_MS) return clearInterval(timer);
      try {
        const res = await fetch(`/api/add/${encodeURIComponent(r.username)}`, { cache: "no-store" });
        const next = (await res.json()) as AddRequest | null;
        if (res.ok && next) setR(next);
      } catch {
        // A missed poll just waits for the next one.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [r.status, r.username]);

  const copy = statusCopy(r);
  const done = isFinished(r.status);
  return (
    <div className="grid max-w-[720px] gap-6">
      <Win title={`add/${r.username}`} meta={done ? "done" : "working…"}>
        <div className="grid gap-3 p-[22px]" aria-live="polite">
          <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{copy.title}</h2>
          <p>{copy.body}</p>
          <div className="flex flex-wrap gap-3">
            {r.person_slug && (r.status === "live" || r.status === "already_here") && (
              <>
                <Button href={`/h/${r.person_slug}`}>Open your profile</Button>
                <Button href="/claim" alt>Claim it</Button>
              </>
            )}
            {r.status === "failed" && <Button href={`/add?u=${encodeURIComponent(r.username)}`}>Try again</Button>}
            {r.status === "nothing_counts" && <Button href="/how-ratings-work" alt>What counts</Button>}
          </div>
        </div>
      </Win>
      {r.events.length > 0 && (
        <Win title="your_hackathons" meta={`${r.events.length}`}>
          <ul>
            {r.events.map((e) => (
              <li key={e.slug} className="flex items-baseline justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
                <span className="min-w-0">
                  {e.state === "rated" || e.state === "loaded" ? (
                    <Link href={`/e/${e.slug}`} className="font-semibold hover:underline">{e.title}</Link>
                  ) : (
                    <span className="font-semibold">{e.title}</span>
                  )}
                  {e.ends_on && <small className="sys ml-2 text-muted">{e.ends_on.slice(0, 7)}</small>}
                </span>
                <span className="sys shrink-0 text-[12px] text-muted">
                  {EVENT_STATE_LABEL[e.state]}
                  {e.reason ? `: ${e.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Win>
      )}
    </div>
  );
}
