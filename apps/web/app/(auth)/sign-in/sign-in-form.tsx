"use client";

import { useActionState } from "react";

import { sendMagicLink, type SignInState } from "../actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <p className="mt-10 max-w-[34ch] text-sub" role="status">
        Check {state.email} for a sign-in link. It works once and expires in an hour.
      </p>
    );
  }

  return (
    <form action={action} className="mt-10 w-full max-w-[520px]">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="block text-[15px] font-semibold text-graphite">
        Email
      </label>
      <div className="mt-2 flex items-center gap-3 rounded-search bg-tile py-2.5 pr-2.5 pl-6 focus-within:shadow-[0_0_0_3px_var(--color-signal)]">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          placeholder="you@school.edu"
          className="min-w-0 flex-1 bg-transparent text-[21px] font-medium placeholder:text-graphite focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-button bg-ink px-5 py-3.5 font-bold text-paper disabled:opacity-60"
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
