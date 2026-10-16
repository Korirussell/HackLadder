"use client";

import { useEffect } from "react";

import { setOwnerTheme, setUseMine, useTheme } from "@/lib/theme-client";
import { type ThemeId, themeName, USE_MINE_KEY } from "@/lib/theme";

/**
 * A claimed profile shows in its owner's theme (§4.7), with a chip to switch back to the
 * viewer's own. The inline script applies it before paint on a direct visit; the effect
 * covers client navigation and puts the viewer's theme back on the way out.
 */
export function OwnerTheme({ theme }: { theme: ThemeId }) {
  const state = useTheme();
  useEffect(() => {
    setOwnerTheme(theme);
    return () => setOwnerTheme(null);
  }, [theme]);
  const script = `try{if(sessionStorage.getItem("${USE_MINE_KEY}")!=="1")document.documentElement.dataset.theme="${theme}"}catch(e){document.documentElement.dataset.theme="${theme}"}`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <div className="sys fixed top-[calc(var(--spacing-menu)+20px)] right-[210px] z-20 flex items-center gap-2 rounded-full border border-line bg-win px-2.5 py-1 text-[11.5px] shadow-win max-[980px]:static max-[980px]:mb-4 max-[980px]:w-fit">
        <span>theme: {themeName(theme)}</span>
        <button
          type="button"
          aria-pressed={state.useMine}
          onClick={() => setUseMine(!state.useMine)}
          className="rounded-full border border-line px-2 py-px hover:border-ink aria-pressed:bg-ink aria-pressed:text-bg"
        >
          use mine
        </button>
      </div>
    </>
  );
}
