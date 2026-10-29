"use client";

import { useActionState, useState } from "react";

import { altButtonClass, buttonClass, fieldClass } from "@/components/site/bits";
import { BIO_MAX } from "@/lib/profile";
import { THEMES, type ThemeId } from "@/lib/theme";

import { type FormState, saveDetails, saveProfileTheme, setHidden } from "./actions";

const IDLE: FormState = { status: "idle" };

function Result({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "" : "text-muted"}>
      {state.message}
    </p>
  );
}

export function DetailsForm({ initial }: { initial: { bio: string; github: string; linkedin: string; website: string } }) {
  const [state, action, pending] = useActionState(saveDetails, IDLE);
  const [bio, setBio] = useState(initial.bio);
  return (
    <form action={action} className="grid gap-4 p-[22px]">
      <label className="grid gap-1.5">
        <span className="font-semibold">Bio</span>
        <textarea name="bio" rows={3} maxLength={BIO_MAX + 40} value={bio} onChange={(e) => setBio(e.target.value)} className={fieldClass} />
        <span className="sys text-[11px] text-muted">
          {bio.trim().length} / {BIO_MAX}
        </span>
      </label>
      {(
        [
          ["github", "GitHub", "github.com/you"],
          ["linkedin", "LinkedIn", "linkedin.com/in/you"],
          ["website", "Website", "you.dev"],
        ] as const
      ).map(([name, label, placeholder]) => (
        <label key={name} className="grid gap-1.5">
          <span className="font-semibold">{label}</span>
          <input name={name} defaultValue={initial[name]} placeholder={placeholder} inputMode="url" className={fieldClass} />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving" : "Save details"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** The claim perk (§4.7): pick a theme for your profile and share card, with a live preview. */
export function ThemePicker({ name, current }: { name: string; current: ThemeId | null }) {
  const [state, action, pending] = useActionState(saveProfileTheme, IDLE);
  const [picked, setPicked] = useState<ThemeId | "">(current ?? "");
  return (
    <form action={action} className="grid gap-4 p-[22px]">
      <fieldset className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
        <legend className="mb-3 font-semibold">Visitors see your profile and share card in</legend>
        {THEMES.map((t) => (
          <label
            key={t.id}
            data-theme={t.id}
            className="cursor-pointer overflow-hidden rounded-[10px] border border-line bg-bg text-ink has-checked:outline-2 has-checked:outline-offset-2 has-checked:outline-select"
          >
            <input type="radio" name="theme" value={t.id} checked={picked === t.id} onChange={() => setPicked(t.id)} className="sr-only" />
            <span className="sys flex h-6 items-center gap-1.5 border-b border-line bg-chrome px-2 text-[10.5px]">
              <i className="size-2 rounded-full bg-accent" />
              <i className="size-2 rounded-full bg-chrome-2" />
              <span className="ml-1">{t.name.toLowerCase()}.card</span>
            </span>
            <span className="block bg-win p-3">
              <span className="numeral block text-[28px]">#1</span>
              <span className="block truncate text-[14px] font-bold">{name}</span>
              <span className="sys mt-1 inline-block rounded-full bg-accent px-2 py-px text-[10px] text-accent-ink">rating up</span>
            </span>
          </label>
        ))}
        <label className="col-span-full flex items-center gap-2 text-[15px]">
          <input type="radio" name="theme" value="" checked={picked === ""} onChange={() => setPicked("")} />
          Follow each visitor&apos;s device (light or dark)
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving" : "Save theme"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function HideForm({ hidden }: { hidden: boolean }) {
  const [state, action, pending] = useActionState(setHidden, IDLE);
  const isHidden = state.status === "saved" ? state.message?.startsWith("Your profile is hidden") : hidden;
  return (
    <form action={action} className="grid gap-3 p-[22px]">
      <p>
        {isHidden
          ? "Your profile is hidden. Nobody can find it, and you show as Hidden hacker on your teams."
          : "Hide your profile from everyone. Your results still count for the people you competed against."}
      </p>
      <input type="hidden" name="hidden" value={isHidden ? "false" : "true"} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={altButtonClass}>
          {isHidden ? "Make my profile public" : "Hide my profile"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}
