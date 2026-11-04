// The two shipped themes (CLAUDE.md §4.1, §4.7): Sakura for light devices, Midnight for dark.
// The site follows the device; only a profile owner can pin their page to one (§15 2026-10-29).

export const THEMES = [
  { id: "sakura", name: "Sakura", swatch: "#ECE8FA" },
  { id: "midnight", name: "Midnight", swatch: "#050507" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/** Retired themes, mapped to the shipped one on the same side (light or dark). */
const RETIRED: Record<string, ThemeId> = { paper: "sakura", sumi: "midnight" };

/** sessionStorage key: the boot screen runs once per session (§4.5). */
export const BOOT_KEY = "hl-booted";
/** sessionStorage key: the viewer chose "use mine" over a profile owner's theme. */
export const USE_MINE_KEY = "hl-use-mine";

export function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** A stored theme as a shipped one: retired light and dark themes map to Sakura and Midnight. */
export function toTheme(value: unknown): ThemeId | null {
  if (isTheme(value)) return value;
  return typeof value === "string" ? (RETIRED[value] ?? null) : null;
}

export function themeName(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.name ?? id;
}

/** The viewer's theme, from the device. */
export function viewerTheme(prefersDark: boolean): ThemeId {
  return prefersDark ? "midnight" : "sakura";
}

/**
 * Runs in <head> before first paint: sets data-theme from the device (no flash of the wrong
 * theme) and marks the first visit of a session so the boot screen covers the page (§4.5).
 * Storage can throw in private windows, so every access is guarded.
 */
export const HEAD_SCRIPT = `(function(){var d=document.documentElement,s=null;
d.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"midnight":"sakura";
try{s=sessionStorage.getItem("${BOOT_KEY}")}catch(e){s="1"}
if(!s&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!/[?&]noboot/.test(location.search))d.classList.add("booting");
})();`;
