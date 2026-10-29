import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isCurrent } from "@/components/os/nav";
import { ratingChart } from "@/lib/chart";
import { claimResultMessage, friendlyError, parseUsername, removalResultMessage } from "@/lib/claim";
import { cleanBio, cleanUrl } from "@/lib/profile";
import { groupHits, hitDetail, hitHref, normalizeQuery, type SearchHit } from "@/lib/search";
import { seasonOf } from "@/lib/season";
import { HEAD_SCRIPT, isTheme, THEMES, toTheme, viewerTheme } from "@/lib/theme";
import { warpPaths } from "@/lib/warp";

describe("themes (§4.7)", () => {
  it("follows the device: Sakura when light, Midnight when dark", () => {
    expect(viewerTheme(false)).toBe("sakura");
    expect(viewerTheme(true)).toBe("midnight");
    expect(isTheme("midnight")).toBe(true);
    expect(isTheme("paper")).toBe(false);
  });

  it("maps retired owner themes to the shipped one on the same side", () => {
    expect(toTheme("paper")).toBe("sakura");
    expect(toTheme("sumi")).toBe("midnight");
    expect(toTheme("midnight")).toBe("midnight");
    expect(toTheme("washi")).toBeNull();
    expect(toTheme(null)).toBeNull();
  });

  it("sets the theme and boot flag before paint, guarding storage", () => {
    for (const t of THEMES) expect(HEAD_SCRIPT).toContain(`"${t.id}"`);
    expect(HEAD_SCRIPT).toContain("prefers-reduced-motion");
    expect(HEAD_SCRIPT.match(/try\{/g)?.length).toBe(1); // sessionStorage; the theme comes from the device
    // It runs as-is in a browser: it must at least parse.
    expect(() => new Function(HEAD_SCRIPT)).not.toThrow();
  });
});

describe("navigation", () => {
  it("marks the current section, including detail pages", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/", "/hackers")).toBe(false);
    expect(isCurrent("/hackers", "/h/maya")).toBe(true);
    expect(isCurrent("/events", "/series/treehacks")).toBe(true);
    expect(isCurrent("/events", "/e/x")).toBe(true);
    expect(isCurrent("/crews", "/crewsx")).toBe(false);
    expect(isCurrent("/me", "/claim")).toBe(true);
  });
});

describe("warped grid", () => {
  it("draws rows and columns with a bulge in the middle", () => {
    const paths = warpPaths(400, 200, 26, 0.35);
    expect(paths.length).toBe(Math.floor((200 + 52) / 26) + 1 + Math.floor((400 + 52) / 26) + 1);
    expect(paths.every((p) => p.startsWith("M") && !p.includes("NaN"))).toBe(true);
  });
});

describe("rating chart", () => {
  it("starts at 1000 and marks the latest point", () => {
    const c = ratingChart([
      { ends_on: "2025-01-01", score: 1100 },
      { ends_on: "2025-06-01", score: 1300 },
    ]);
    expect(c.line.split("L").length).toBe(3);
    expect(c.last?.x).toBeCloseTo(600 - 18);
    expect(c.grid.map((g) => g.label)).toContain("1,000");
    expect(c.area.endsWith("Z")).toBe(true);
  });

  it("copes with a single flat point", () => {
    const c = ratingChart([{ ends_on: null, score: 1000 }]);
    expect(c.line).not.toContain("NaN");
  });
});

describe("search", () => {
  const hit = (kind: SearchHit["kind"], slug: string, extra: Partial<SearchHit> = {}): SearchHit => ({
    kind,
    slug,
    name: slug,
    username: null,
    school: null,
    rank_score: null,
    ...extra,
  });

  it("needs two characters and caps the length", () => {
    expect(normalizeQuery(" a ")).toBeNull();
    expect(normalizeQuery("  maya   ok ")).toBe("maya ok");
    expect(normalizeQuery("x".repeat(200))?.length).toBe(80);
  });

  it("groups hackers, schools, events in that order and links each", () => {
    const groups = groupHits([hit("event", "e1"), hit("hacker", "h1"), hit("event", "e2")]);
    expect(groups.map((g) => g.kind)).toEqual(["hacker", "event"]);
    expect(groups[1].hits.map((h) => h.slug)).toEqual(["e1", "e2"]);
    expect([hitHref(hit("hacker", "a")), hitHref(hit("school", "b")), hitHref(hit("event", "c"))]).toEqual(["/h/a", "/s/b", "/e/c"]);
    expect(hitDetail(hit("hacker", "a", { username: "maya", school: "Georgia Tech" }))).toBe("@maya · Georgia Tech");
  });
});

describe("claiming and removal (§11, §9.4)", () => {
  it("reads a Devpost username from what people paste", () => {
    expect(parseUsername("jane-doe")).toBe("jane-doe");
    expect(parseUsername("https://devpost.com/jane-doe/")).toBe("jane-doe");
    expect(parseUsername("www.devpost.com/NilsIrl?ref=x")).toBe("NilsIrl");
    expect(parseUsername("@jane_doe")).toBe("jane_doe");
    expect(parseUsername("jane doe")).toBeNull();
    expect(parseUsername("../admin")).toBeNull();
    expect(parseUsername("")).toBeNull();
  });

  it("explains every result", () => {
    expect(claimResultMessage("claimed").ok).toBe(true);
    expect(claimResultMessage("merged").ok).toBe(true);
    expect(claimResultMessage("code_missing")).toMatchObject({ ok: false });
    expect(claimResultMessage("profile_missing").message).toMatch(/private/);
    expect(removalResultMessage("removed").ok).toBe(true);
    expect(removalResultMessage("weird").ok).toBe(false);
  });

  it("shows the database's own sentence only for deliberate errors", () => {
    expect(friendlyError({ code: "P0001", message: "That code expired. Get a new one." })).toBe("That code expired. Get a new one.");
    expect(friendlyError({ code: "XX000", message: "internal stack trace" })).not.toMatch(/stack/);
    expect(friendlyError({ code: "42501", message: "permission denied" })).toBe("Sign in first.");
  });
});

describe("profile fields", () => {
  it("accepts links, normalizes them to https, and checks hosts", () => {
    expect(cleanUrl("github.com/kori", "GitHub", ["github.com"])).toEqual({ ok: true, value: "https://github.com/kori" });
    expect(cleanUrl("http://www.linkedin.com/in/k", "LinkedIn", ["linkedin.com"])).toEqual({ ok: true, value: "https://www.linkedin.com/in/k" });
    expect(cleanUrl("https://evil.com/github.com", "GitHub", ["github.com"]).ok).toBe(false);
    expect(cleanUrl("javascript:alert(1)", "Website").ok).toBe(false);
    expect(cleanUrl("  ", "Website")).toEqual({ ok: true, value: null });
  });

  it("limits the bio", () => {
    expect(cleanBio(" hi ")).toEqual({ ok: true, value: "hi" });
    expect(cleanBio("x".repeat(281)).ok).toBe(false);
    expect(cleanBio("")).toEqual({ ok: true, value: null });
  });
});

describe("seasons", () => {
  it("run August to July", () => {
    expect(seasonOf(new Date("2026-10-16T00:00:00Z"))).toEqual({ start: 2026, name: "2026-27" });
    expect(seasonOf(new Date("2026-07-31T00:00:00Z"))).toEqual({ start: 2025, name: "2025-26" });
  });
});

describe("share cards", () => {
  it("use the same theme colors as the site", async () => {
    const globals = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    const og = readFileSync(join(__dirname, "../lib/og.tsx"), "utf8");
    for (const t of THEMES) {
      const block = globals.match(new RegExp(String.raw`\[data-theme="${t.id}"\]\s*\{([^}]*)\}`))![1];
      const css = (token: string) => block.match(new RegExp(String.raw`--${token}:\s*(#[0-9a-f]{6})`))![1].toUpperCase();
      const line = og.split("\n").find((l) => l.trimStart().startsWith(`${t.id}:`))!;
      for (const [key, token] of [["bg", "bg"], ["win", "win"], ["ink", "ink"], ["accent", "accent"], ["muted", "muted"]]) {
        expect(line).toContain(`${key}: "${css(token)}"`);
      }
    }
  });
});
