import { describe, expect, it } from "vitest";

import {
  changeTone,
  dateRange,
  fileName,
  initials,
  isoDate,
  monthYear,
  num,
  odds,
  pageParam,
  pages,
  plural,
  signed,
  tierLabel,
  timecode,
  topPercent,
} from "@/lib/format";

describe("numbers", () => {
  it("groups thousands and rounds", () => {
    expect(num(412880)).toBe("412,880");
    expect(num(2183.6)).toBe("2,184");
    expect(num(null)).toBe("—");
  });

  it("signs rating changes with a real minus and ±0 for none (§4.1)", () => {
    expect(signed(41)).toBe("+41");
    expect(signed(-8)).toBe("−8");
    expect(signed(0)).toBe("±0");
    expect(signed(null)).toBe("±0");
    expect([changeTone(3), changeTone(-3), changeTone(0)]).toEqual(["up", "down", "flat"]);
  });

  it("writes odds as 1 in N", () => {
    expect(odds(214.4)).toBe("1 in 214");
    expect(odds(0.4)).toBe("1 in 1");
    expect(odds(null)).toBe("unrated");
  });

  it("writes the top share", () => {
    expect(topPercent(3.2)).toBe("Top 3%");
    expect(topPercent(0.0123)).toBe("Top 0.01%");
    expect(topPercent(0.4)).toBe("Top 0.4%");
    expect(topPercent(null)).toBeNull();
  });

  it("pluralizes and pages", () => {
    expect(plural(1, "event")).toBe("1 event");
    expect(plural(2, "entry", "entries")).toBe("2 entries");
    expect(pages(0, 50)).toBe(1);
    expect(pages(101, 50)).toBe(3);
    expect(pageParam("3")).toBe(3);
    expect(pageParam(["2"])).toBe(2);
    expect(pageParam("-1")).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(pageParam("9", 4)).toBe(4);
  });
});

describe("timecodes", () => {
  it("formats DD:HH:MM:SS and never goes negative", () => {
    expect(timecode((2 * 86400 + 4 * 3600 + 13 * 60 + 9) * 1000)).toBe("02:04:13:09");
    expect(timecode(-5000)).toBe("00:00:00:00");
    expect(timecode(120 * 86400 * 1000)).toBe("120:00:00:00");
  });
});

describe("names and dates", () => {
  it("makes file-style window titles", () => {
    expect(fileName("TreeHacks 2026", "mov")).toBe("treehacks_2026.mov");
    expect(fileName("Cal Hacks 12.0", "mov")).toBe("cal_hacks_12_0.mov");
    expect(fileName("Hack@Brown — Ünïcode")).toBe("hack_brown_unicode");
    expect(fileName("!!!")).toBe("untitled");
  });

  it("takes initials from the first and last name", () => {
    expect(initials("Dev Raghunathan")).toBe("DR");
    expect(initials("Maya Ada Okonkwo")).toBe("MO");
    expect(initials("dylanjpaulson")).toBe("DY");
  });

  it("formats dates in UTC", () => {
    expect(isoDate("2026-10-05T23:00:00+00:00")).toBe("2026-10-05");
    expect(monthYear("2023-03-04")).toBe("Mar 2023");
    expect(monthYear("2023-03-04", "long")).toBe("March 2023");
    expect(dateRange("2026-02-14", "2026-02-16")).toBe("Feb 14–16, 2026");
    expect(dateRange("2026-01-30", "2026-02-01")).toBe("Jan 30 – Feb 1, 2026");
    expect(dateRange("2025-12-28", "2026-01-02")).toBe("Dec 28, 2025 – Jan 2, 2026");
    expect(dateRange(null, "2026-02-16")).toBe("Feb 16, 2026");
  });

  it("names placements by prize tier", () => {
    expect(tierLabel(1)).toBe("grand prize");
    expect(tierLabel(4)).toBe("tech prize");
    expect(tierLabel(5)).toBe("submitted");
    expect(tierLabel(null)).toBe("submitted");
  });
});
