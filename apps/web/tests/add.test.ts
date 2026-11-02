import { describe, expect, it } from "vitest";

import { addHref, asUsername, decodeSegment, isFinished, statusCopy, type AddRequest } from "@/lib/add";

const req = (status: AddRequest["status"], extra: Partial<AddRequest> = {}): AddRequest => ({
  username: "kori",
  status,
  events: [],
  person_slug: null,
  updated_at: "2026-10-29T12:00:00Z",
  ...extra,
});

describe("add-me (spec 2026-10-29)", () => {
  it("decodes a path segment, and returns null for malformed percent-encoding", () => {
    expect(decodeSegment("kori%2Drussell")).toBe("kori-russell");
    expect(decodeSegment("%E0%A4%A")).toBeNull();
    expect(decodeSegment("%")).toBeNull();
    expect(asUsername(decodeSegment("%zz"))).toBeNull();
  });

  it("reads a Devpost username from what people paste", () => {
    expect(asUsername("jemsbhai")).toBe("jemsbhai");
    expect(asUsername("  @jemsbhai ")).toBe("jemsbhai");
    expect(asUsername("https://devpost.com/jemsbhai")).toBe("jemsbhai");
    expect(asUsername("devpost.com/jemsbhai?ref=x")).toBe("jemsbhai");
    expect(asUsername("kori russell")).toBeNull();
    expect(asUsername("")).toBeNull();
    expect(asUsername("x".repeat(41))).toBeNull();
  });

  it("links no-results to /add, pre-filled when the query is a username", () => {
    expect(addHref("jemsbhai")).toBe("/add?u=jemsbhai");
    expect(addHref("kori russell")).toBe("/add");
    expect(addHref(null)).toBe("/add");
  });

  it("keeps checking only while the pipeline is working", () => {
    expect(isFinished("queued")).toBe(false);
    expect(isFinished("looking_up")).toBe(false);
    expect(isFinished("crawling")).toBe(false);
    for (const s of ["already_here", "live", "nothing_counts", "not_found", "failed"] as const) expect(isFinished(s)).toBe(true);
  });

  it("has copy for every status, naming the username where it helps", () => {
    for (const s of ["queued", "looking_up", "already_here", "crawling", "live", "nothing_counts", "not_found", "failed"] as const) {
      const c = statusCopy(req(s));
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
    }
    expect(statusCopy(req("not_found")).title).toContain("kori");
  });
});
