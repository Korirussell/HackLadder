import { describe, expect, it } from "vitest";

import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it.each([
    ["/admin/events", "/admin/events"],
    ["/admin?x=1", "/admin?x=1"],
    ["https://evil.example/", "/"],
    ["//evil.example/", "/"],
    [String.raw`/\evil.example`, "/"], // browsers treat /\ like //
    ["admin", "/"],
    ["", "/"],
    [null, "/"],
  ])("%s -> %s", (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});
