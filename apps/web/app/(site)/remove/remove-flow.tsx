"use client";

import { useActionState } from "react";

import { altButtonClass, buttonClass, fieldClass } from "@/components/site/bits";
import { Win } from "@/components/os/window";

import { removeAction, type RemoveState } from "./actions";

export function RemoveFlow() {
  const [state, action, pending] = useActionState<RemoveState, FormData>(removeAction, { step: "start" });

  if (state.step === "done") {
    return (
      <Win title="remove.app" status={["done", ""]}>
        <p className="text-sub p-[22px]" role="status">
          {state.message}
        </p>
      </Win>
    );
  }

  if (state.step === "code") {
    return (
      <Win title="remove.app" meta={`devpost/${state.code.username}`} status={["step 2 of 2", "code works for 48 hours"]}>
        <form action={action} className="grid gap-5 p-[22px]">
          <p>
            Add this anywhere in your Devpost bio (devpost.com/{state.code.username}), save, then press Verify.
          </p>
          <code className="stat w-fit rounded-button border border-line bg-bg px-4 py-2 text-[clamp(32px,5vw,48px)] select-all">
            {state.code.code}
          </code>
          {state.error && (
            <p role="alert" className="max-w-[60ch]">
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button type="submit" name="intent" value="verify" disabled={pending} className={buttonClass}>
              {pending ? "Checking Devpost" : "Verify and remove"}
            </button>
            <button type="submit" name="intent" value="restart" disabled={pending} className={altButtonClass}>
              Different username
            </button>
          </div>
        </form>
      </Win>
    );
  }

  return (
    <Win title="remove.app" status={["step 1 of 2", "find your account"]}>
      <form action={action} className="grid gap-4 p-[22px]">
        <label htmlFor="username" className="font-semibold">
          Your Devpost username
        </label>
        <div className="flex flex-wrap gap-2.5">
          <input
            id="username"
            name="username"
            required
            defaultValue={state.username}
            placeholder="devpost.com/your-username"
            spellCheck={false}
            className={`${fieldClass} min-w-0 flex-1`}
          />
          <button type="submit" name="intent" value="start" disabled={pending} className={buttonClass}>
            {pending ? "Getting a code" : "Get my code"}
          </button>
        </div>
        {state.error && (
          <p role="alert" className="max-w-[60ch]">
            {state.error}
          </p>
        )}
      </form>
    </Win>
  );
}
