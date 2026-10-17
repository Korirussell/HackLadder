"use client";

import { useActionState } from "react";

import { sendMagicLink, type SignInState } from "../actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <p className="max-w-[34ch] text-sub" role="status">
        Check {state.email} for a sign-in link. It works once and expires in an hour.
      </p>
    );
  }

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="block text-[15px] font-semibold text-muted">
        Email
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-search border border-line bg-bg py-2 pr-2 pl-4 focus-within:border-select focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--select)_25%,transparent)]">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          placeholder="you@school.edu"
          className="min-w-0 flex-1 bg-transparent text-[18px] placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-button bg-ink px-4 py-[11px] text-[15px] font-bold text-bg disabled:opacity-60"
        >
          {pending ? "Sending" : "Send sign-in link"}
        </button>
      </div>
      {state.status === "error" && (
        <p className="mt-3 text-[15px]" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
