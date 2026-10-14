import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// design/reference.html is the visual source of truth (CLAUDE.md §4); globals.css must mirror it.
const root = join(__dirname, "..");
const reference = readFileSync(join(root, "../../design/reference.html"), "utf8");
const globals = readFileSync(join(root, "app/globals.css"), "utf8");

const TOKENS = ["paper", "ink", "signal", "tile", "graphite", "rule"] as const;

function hex(source: string, pattern: RegExp): string | undefined {
  return source.match(pattern)?.[1]?.toLowerCase();
}

describe("design tokens", () => {
  it.each(TOKENS)("--color-%s matches the reference", (name) => {
    const expected = hex(reference, new RegExp(String.raw`--${name}:\s*(#[0-9a-fA-F]{6})`));
    const actual = hex(globals, new RegExp(String.raw`--color-${name}:\s*(#[0-9a-fA-F]{6})`));
    expect(expected).toBeDefined();
    expect(actual).toBe(expected);
  });

  it("defines no other colors", () => {
    const colors = [...globals.matchAll(/--color-([a-z-]+):\s*#/g)].map((m) => m[1]);
    expect(colors.sort()).toEqual([...TOKENS].sort());
  });

  it("loads the reference font family", () => {
    expect(reference).toContain("family=Bricolage+Grotesque:opsz,wdth,wght");
    const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/Bricolage_Grotesque\(\{[\s\S]*axes: \["opsz", "wdth"\]/);
  });
});
