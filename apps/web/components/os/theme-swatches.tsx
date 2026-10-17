"use client";

import { chooseTheme, effectiveTheme, useTheme } from "@/lib/theme-client";
import { THEMES, type ThemeId } from "@/lib/theme";

import { saveUiTheme } from "./theme-actions";

/** The dock's theme switcher (§4.7): saved locally, and to the account when signed in. */
export function ThemeSwatches() {
  const state = useTheme();
  const active = effectiveTheme(state);
  const pick = (id: ThemeId) => {
    chooseTheme(id);
    // Best effort: signed-out viewers and unclaimed accounts have nowhere to save it.
    saveUiTheme(id).catch(() => {});
  };
  return (
    <span role="group" aria-label="Theme" className="flex shrink-0 items-center gap-1.5 px-1 max-[980px]:gap-1 max-[980px]:px-0">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.name}
          aria-label={`${t.name} theme`}
          aria-pressed={active === t.id}
          onClick={() => pick(t.id)}
          style={{ background: t.swatch }}
          className="size-4 rounded-full border-2 border-line p-0 aria-pressed:border-ink aria-pressed:shadow-[0_0_0_2px_var(--win)_inset]"
        />
      ))}
    </span>
  );
}
