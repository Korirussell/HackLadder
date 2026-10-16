import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { THEMES } from "@/lib/theme";

// design/reference.html is the visual source of truth (CLAUDE.md §4); globals.css must mirror it.
const root = join(__dirname, "..");
const reference = readFileSync(join(root, "../../design/reference.html"), "utf8");
const globals = readFileSync(join(root, "app/globals.css"), "utf8");

const TOKENS = [
  "bg", "grid", "win", "chrome", "chrome-2", "ink", "muted", "line",
  "accent", "accent-ink", "select", "select-ink", "rail", "rung",
] as const; // prettier-ignore

/** The hex tokens in a theme's `[data-theme="name"]{...}` block. */
function themeBlock(source: string, theme: string): Record<string, string> {
  const block = source.match(new RegExp(String.raw`\[data-theme="${theme}"\]\s*\{([^}]*)\}`))?.[1];
  if (!block) return {};
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}

describe("design tokens", () => {
  it("ships the reference's themes, in order", () => {
    const inReference = [...reference.matchAll(/data-t="([a-z]+)"/g)].map((m) => m[1]);
    expect(THEMES.map((t) => t.id)).toEqual(inReference);
  });

  describe.each(THEMES.map((t) => t.id))("%s", (theme) => {
    it.each(TOKENS)("--%s matches the reference", (token) => {
      const expected = themeBlock(reference, theme)[token];
      expect(expected).toBeDefined();
      expect(themeBlock(globals, theme)[token]).toBe(expected);
    });
  });

  it("uses Paper when no theme is set", () => {
    expect(globals).toMatch(/:root,\s*\[data-theme="paper"\]\s*\{/);
  });

  it("defines colors only from the theme tokens", () => {
    const colors = [...globals.matchAll(/--color-([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g)];
    expect(colors.every((m) => m[1] === m[2])).toBe(true);
    expect(colors.map((m) => m[1]).sort()).toEqual(TOKENS.filter((t) => t !== "rail" && t !== "rung").sort());
    expect(globals).not.toMatch(/--color-[a-z0-9-]+:\s*#/);
  });

  it("loads the reference font families", () => {
    expect(reference).toContain("family=Bricolage+Grotesque:opsz,wdth,wght");
    expect(reference).toContain("family=IBM+Plex+Mono");
    const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/Bricolage_Grotesque\(\{[\s\S]*axes: \["opsz", "wdth"\]/);
    expect(layout).toMatch(/IBM_Plex_Mono\(\{/);
  });
});
