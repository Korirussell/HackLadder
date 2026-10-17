"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { altButtonClass, buttonClass, fieldClass } from "@/components/site/bits";
import { Win } from "@/components/os/window";

import { claimAction, type ClaimState } from "./actions";

type Open = { attemptId: number; username: string; expiresAt: string };

const expires = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

export function ClaimFlow({ initialUsername, open, merging }: { initialUsername: string; open: Open[]; merging: boolean }) {
  const [state, action, pending] = useActionState<ClaimState, FormData>(claimAction, { step: "start", username: initialUsername });
  const [copied, setCopied] = useState(false);

  if (state.step === "done") {
    return (
      <Win title="claim.app" status={["step 3 of 3", "verified"]}>
        <div className="grid gap-4 p-[22px]" role="status">
          <p className="text-sub">{state.message}</p>
          <div className="flex flex-wrap gap-2.5">
            {state.slug && (
              <Link href={`/h/${state.slug}`} className={buttonClass}>
                See your profile
              </Link>
            )}
            <Link href="/me" className={altButtonClass}>
              Add links, school and theme
            </Link>
          </div>
        </div>
      </Win>
    );
  }

  if (state.step === "code") {
    const { code } = state;
    return (
      <Win title="claim.app" meta={`devpost/${code.username}`} status={["step 2 of 3", `code works until ${expires(code.expiresAt)}`]}>
        <form action={action} className="grid gap-5 p-[22px]">
          <input type="hidden" name="attempt" value={state.attemptId} />
          <p>
            Add this anywhere in the bio of{" "}
            <a href={`https://devpost.com/settings`} target="_blank" rel="noreferrer" className="font-semibold underline">
              your Devpost profile
            </a>{" "}
            (<b>{code.displayName}</b>, devpost.com/{code.username}), then press Verify. You can delete it afterward.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="stat rounded-button border border-line bg-bg px-4 py-2 text-[clamp(32px,5vw,48px)] select-all">{code.code}</code>
            <button
              type="button"
              className={altButtonClass}
              onClick={() => {
                navigator.clipboard?.writeText(code.code).then(() => setCopied(true), () => {});
              }}
            >
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          {state.error && (
            <p role="alert" className="max-w-[60ch]">
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button type="submit" name="intent" value="verify" disabled={pending} className={buttonClass}>
              {pending ? "Checking Devpost" : "Verify"}
            </button>
            <button type="submit" name="intent" value="restart" disabled={pending} className={altButtonClass}>
              Use a different username
            </button>
          </div>
        </form>
      </Win>
    );
  }

  return (
    <Win title="claim.app" status={["step 1 of 3", merging ? "add another account" : "find your account"]}>
      <form action={action} className="grid gap-4 p-[22px]">
        <label htmlFor="username" className="font-semibold">
          {merging ? "Another Devpost username" : "Your Devpost username"}
        </label>
        <div className="flex flex-wrap gap-2.5">
          <input
            id="username"
            name="username"
            required
            defaultValue={state.username}
            placeholder="devpost.com/your-username"
            autoComplete="username"
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
      {open.length > 0 && (
        <div className="border-t border-line">
          <p className="sys px-3.5 pt-3 text-[11px] text-muted">open codes</p>
          {open.map((o) => (
            <form key={o.attemptId} action={action} className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
              <input type="hidden" name="attempt" value={o.attemptId} />
              <span>
                devpost/{o.username} <span className="sys text-[11px] text-muted">until {expires(o.expiresAt)}</span>
              </span>
              <button type="submit" name="intent" value="resume" className="sys rounded-md border border-line px-2.5 py-1 hover:border-ink">
                continue
              </button>
            </form>
          ))}
        </div>
      )}
    </Win>
  );
}
