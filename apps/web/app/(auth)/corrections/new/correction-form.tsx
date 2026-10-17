"use client";

import Link from "next/link";
import { useActionState } from "react";

import { buttonClass, fieldClass } from "@/components/site/bits";

import { type CorrectionState, sendCorrection } from "./actions";
import { CORRECTION_KINDS } from "./kinds";

export function CorrectionForm({ person, events }: { person: string; events: string[] }) {
  const [state, action, pending] = useActionState<CorrectionState, FormData>(sendCorrection, { status: "idle" });
  if (state.status === "sent") {
    return (
      <div className="grid gap-4 p-[22px]" role="status">
        <p className="text-sub">{state.message}</p>
        <Link href={`/h/${person}`} className="underline">
          Back to the profile
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4 p-[22px]">
      <input type="hidden" name="person" value={person} />
      <label className="grid gap-1.5">
        <span className="font-semibold">What&apos;s wrong</span>
        <select name="kind" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Pick one
          </option>
          {CORRECTION_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {events.length > 0 && (
        <label className="grid gap-1.5">
          <span className="font-semibold">Which event (if it&apos;s about one)</span>
          <select name="event" defaultValue="" className={fieldClass}>
            <option value="">Not about one event</option>
            {events.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="grid gap-1.5">
        <span className="font-semibold">Details</span>
        <textarea
          name="details"
          required
          rows={5}
          placeholder="What's wrong, and what's right? Links to the Devpost project help."
          className={fieldClass}
        />
      </label>
      {state.status === "error" && <p role="alert">{state.message}</p>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Sending" : "Send correction"}
        </button>
      </div>
    </form>
  );
}
