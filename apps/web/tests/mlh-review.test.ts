import { describe, expect, it } from "vitest";

import {
  type Candidate,
  choices,
  isLikelyRight,
  nearestFirst,
  parseCandidates,
  type ReviewRow,
  searchPattern,
  toReviewRow,
} from "@/lib/mlh-review";

const cand = (id: number, patch: Partial<Candidate> = {}): Candidate => ({
  hackathon_id: id,
  slug: `event-${id}`,
  title: `Event ${id}`,
  ends_on: "2024-10-20",
  score: 0.8,
  days: 0,
  name_match: "fuzzy",
  ...patch,
});

const row = (patch: Partial<ReviewRow> = {}): ReviewRow => ({
  mlh_event_id: 1,
  mlh_name: "MadHacks",
  season: "2025",
  starts_at: "2024-10-18T21:00:00+00:00",
  ends_at: "2024-10-20T19:00:00+00:00",
  format: "physical",
  location: null,
  website_url: null,
  is_high_school: false,
  status: "suggested",
  score: 0.79,
  note: null,
  hackathon_id: 10,
  hackathon_slug: "event-10",
  hackathon_title: "Event 10",
  hackathon_ends_on: "2024-10-20",
  candidates: [cand(10, { name_match: "contains" }), cand(11)],
  ...patch,
});

describe("parseCandidates", () => {
  it("keeps well-formed candidates and drops the rest", () => {
    const good = cand(1, { name_match: "exact" });
    expect(parseCandidates([good, { hackathon_id: "2" }, null, { ...good, name_match: "weird" }])).toEqual([good]);
  });

  it("treats anything but an array as no candidates", () => {
    expect(parseCandidates(null)).toEqual([]);
    expect(parseCandidates({ hackathon_id: 1 })).toEqual([]);
  });
});

describe("toReviewRow", () => {
  it("reads a view row and rejects one without an id or with an unknown status", () => {
    const r = toReviewRow({ mlh_event_id: 5, mlh_name: "X", status: "auto", candidates: [] });
    expect(r?.mlh_event_id).toBe(5);
    expect(r?.status).toBe("auto");
    expect(toReviewRow({ mlh_name: "X" })).toBeNull();
    expect(toReviewRow({ mlh_event_id: 5, status: "maybe" })).toBeNull();
  });

  it("treats an event with no match row yet as unmatched", () => {
    expect(toReviewRow({ mlh_event_id: 5, status: null })?.status).toBe("unmatched");
  });
});

describe("isLikelyRight", () => {
  it("accepts a contained name on the same weekend with no rival name", () => {
    expect(isLikelyRight(row())).toBe(true);
  });

  it("rejects fuzzy names, distant deadlines and named rivals", () => {
    expect(isLikelyRight(row({ candidates: [cand(10), cand(11)] }))).toBe(false);
    expect(isLikelyRight(row({ candidates: [cand(10, { name_match: "contains", days: 2 })] }))).toBe(false);
    expect(
      isLikelyRight(row({ candidates: [cand(10, { name_match: "contains" }), cand(11, { name_match: "exact" })] })),
    ).toBe(false);
  });

  it("only applies to open suggestions", () => {
    expect(isLikelyRight(row({ status: "auto" }))).toBe(false);
    expect(isLikelyRight(row({ status: "unmatched", hackathon_id: null }))).toBe(false);
  });
});

describe("choices", () => {
  it("offers the matcher's candidates as they are", () => {
    expect(choices(row()).map((c) => c.hackathon_id)).toEqual([10, 11]);
  });

  it("puts a current match the matcher didn't list first", () => {
    const r = row({ hackathon_id: 99, hackathon_title: "Picked by hand", hackathon_ends_on: "2024-10-22" });
    const [first] = choices(r);
    expect(first.hackathon_id).toBe(99);
    expect(first.title).toBe("Picked by hand");
    expect(first.days).toBe(2);
  });
});

describe("search helpers", () => {
  it("builds an in-order word pattern without wildcards from the input", () => {
    expect(searchPattern("cal hacks")).toBe("%cal%hacks%");
    expect(searchPattern("  Cal Hacks 11.0 ")).toBe("%Cal%Hacks%11.0%");
    expect(searchPattern("100%_done")).toBe("%100%done%");
    expect(searchPattern("a")).toBeNull();
  });

  it("orders results by distance from the event's date", () => {
    const results = [{ ends_on: "2024-01-01" }, { ends_on: "2024-10-21" }, { ends_on: null }, { ends_on: "2024-09-01" }];
    expect(nearestFirst(results, "2024-10-20").map((r) => r.ends_on)).toEqual([
      "2024-10-21",
      "2024-09-01",
      "2024-01-01",
      null,
    ]);
  });
});
