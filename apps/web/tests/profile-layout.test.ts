import { describe, expect, it } from "vitest";

import { arrangeProjects, arrangeTrophies, cleanLayout, readLayout } from "@/lib/profile-layout";

const trophy = (key: string, project_id: number) => ({ key, project_id });
const event = (project_id: number) => ({ project_id });

describe("readLayout", () => {
  it("fills in defaults and drops anything malformed", () => {
    expect(readLayout(null)).toEqual({ projects: "list", trophies: [], pinned: [], hidden: [] });
    expect(readLayout({ projects: "carousel", pinned: [1, "2", -3, 4, 5, 6], trophies: [7] })).toEqual({
      projects: "list",
      trophies: [],
      pinned: [1, 4, 5],
      hidden: [],
    });
  });
});

describe("arrangeTrophies", () => {
  const all = [trophy("1:Grand", 1), trophy("2:Track", 2), trophy("3:MLH", 3)];

  it("keeps the default order until the owner arranges it", () => {
    expect(arrangeTrophies(all, {}).map((t) => t.key)).toEqual(["1:Grand", "2:Track", "3:MLH"]);
  });

  it("puts arranged trophies first, in the owner's order, then new ones", () => {
    expect(arrangeTrophies(all, { trophies: ["3:MLH", "1:Grand"] }).map((t) => t.key)).toEqual(["3:MLH", "1:Grand", "2:Track"]);
  });

  it("leaves out trophies from hidden projects", () => {
    expect(arrangeTrophies(all, { hidden: [2] }).map((t) => t.key)).toEqual(["1:Grand", "3:MLH"]);
  });
});

describe("arrangeProjects", () => {
  const events = [event(1), event(2), event(3), event(4)];

  it("shows pinned projects first, in pin order, and hides hidden ones", () => {
    const { pinned, rest } = arrangeProjects(events, { pinned: [3, 1], hidden: [4] });
    expect(pinned.map((e) => e.project_id)).toEqual([3, 1]);
    expect(rest.map((e) => e.project_id)).toEqual([2]);
  });

  it("ignores pins for projects that aren't there or are hidden", () => {
    const { pinned, rest } = arrangeProjects(events, { pinned: [9, 2], hidden: [2] });
    expect(pinned).toEqual([]);
    expect(rest.map((e) => e.project_id)).toEqual([1, 3, 4]);
  });
});

describe("cleanLayout", () => {
  const own = { trophyKeys: ["1:Grand", "2:Track"], projectIds: [1, 2, 3, 4] };

  it("keeps only the person's own trophies and projects, once each", () => {
    const res = cleanLayout(
      { projects: "cards", trophies: ["2:Track", "9:Someone else's", "2:Track", "1:Grand"], pinned: [1, 1, 99], hidden: [4, 77] },
      own,
    );
    expect(res).toEqual({ ok: true, layout: { projects: "cards", trophies: ["2:Track", "1:Grand"], pinned: [1], hidden: [4] } });
  });

  it("rejects too many pins and unknown layouts", () => {
    expect(cleanLayout({ pinned: [1, 2, 3, 4] }, own)).toMatchObject({ ok: false });
    expect(cleanLayout({ projects: "carousel" }, own)).toMatchObject({ ok: false });
    expect(cleanLayout("nope", own)).toMatchObject({ ok: false });
  });

  it("drops a pin on a project that is also hidden", () => {
    expect(cleanLayout({ pinned: [2], hidden: [2] }, own)).toMatchObject({ ok: true, layout: { pinned: [], hidden: [2] } });
  });
});
