// The four shipped themes (CLAUDE.md §4.1, §4.7), in the order they're listed everywhere.

export const THEMES = [
  { id: "paper", name: "Paper", swatch: "#F2EEE5" },
  { id: "sumi", name: "Sumi", swatch: "#171512" },
  { id: "sakura", name: "Sakura", swatch: "#ECE8FA" },
  { id: "midnight", name: "Midnight", swatch: "#050507" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/** localStorage key for the viewer's own theme (a per-viewer convenience). */
export const THEME_KEY = "hl-theme";
/** sessionStorage key: the boot screen runs once per session (§4.5). */
export const BOOT_KEY = "hl-booted";
/** sessionStorage key: the viewer chose "use mine" over a profile owner's theme. */
export const USE_MINE_KEY = "hl-use-mine";

export function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function themeName(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.name ?? id;
}

/** The viewer's theme: their saved choice, else the device (light gets Paper, dark gets Sumi). */
export function viewerTheme(saved: string | null, prefersDark: boolean): ThemeId {
  return isTheme(saved) ? saved : prefersDark ? "sumi" : "paper";
}

/**
 * Runs in <head> before first paint: sets data-theme (no flash of the wrong theme) and marks the
 * first visit of a session so the boot screen covers the page (§4.5). Storage can throw in
 * private windows, so every access is guarded.
 */
export const HEAD_SCRIPT = `(function(){var d=document.documentElement,t=null,s=null;
try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}
var ok=${JSON.stringify(THEMES.map((t) => t.id))};
d.dataset.theme=ok.indexOf(t)>=0?t:(matchMedia("(prefers-color-scheme: dark)").matches?"sumi":"paper");
try{s=sessionStorage.getItem("${BOOT_KEY}")}catch(e){s="1"}
if(!s&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!/[?&]noboot/.test(location.search))d.classList.add("booting");
})();`;
