"use client";

import { useActionState } from "react";

import { type FormState, requestRecompute } from "@/app/admin/actions";
import { button } from "@/lib/ui";

export function RecomputeButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestRecompute, { ok: false, errors: [] });
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Starting" : "Recompute ratings"}
      </button>
      {state.ok && !pending && (
        <p role="status" className="mt-3 text-[15px] text-muted">
          Started. A full rerun takes a few minutes; it appears below when it finishes.
        </p>
      )}
      {state.errors.map((e) => (
        <p key={e} role="alert" className="mt-3 max-w-[70ch] text-[15px]">
          {e}
        </p>
      ))}
    </form>
  );
}
