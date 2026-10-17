"use client";

import { type ReactNode, useActionState } from "react";

import type { FormState } from "@/app/admin/actions";
import { button } from "@/lib/ui";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** A form bound to an admin Server Action, showing "Saved" or the problems it returned. */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
}: {
  action: Action;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { ok: false, errors: [] });
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Saving" : submitLabel}
        </button>
        {state.ok && !pending && (
          <span role="status" className="text-[15px] text-muted">
            Saved. Applies at the next rating run.
          </span>
        )}
      </div>
      {state.errors.length > 0 && (
        <ul role="alert" className="mt-3 list-disc pl-5 text-[15px]">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
