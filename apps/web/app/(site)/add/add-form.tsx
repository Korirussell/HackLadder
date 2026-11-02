"use client";

import { useActionState } from "react";

import { buttonClass, fieldClass } from "@/components/site/bits";

import { type AddFormState, requestAdd } from "./actions";

const IDLE: AddFormState = { error: null };

export function AddForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState(requestAdd, IDLE);
  return (
    <form action={action} className="grid gap-3 p-[22px]">
      <label className="grid gap-1.5">
        <span className="font-semibold">Your Devpost username</span>
        <span className="sys text-[12px] text-muted">devpost.com/<b>username</b></span>
        {/* After an error React resets the form, so show what was typed again. */}
        <input key={state.username ?? ""} name="username" defaultValue={state.username ?? initial} required maxLength={80} autoComplete="off" spellCheck={false} className={fieldClass} />
      </label>
      {state.error && <p role="alert" className="text-[15px]">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Looking you up" : "Find my hackathons"}
        </button>
      </div>
    </form>
  );
}
