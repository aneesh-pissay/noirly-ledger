import { describe, expect, it } from "vitest";
import { carriedIn, finishedPeriods } from "@/src/core/budgets/rollover";
import { isoDate } from "@/src/core/budgets/period";

describe("finishedPeriods", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");

  it("lists whole months from the one containing the start, up to this one", () => {
    const months = finishedPeriods("monthly", new Date("2026-07-15T00:00:00.000Z"), now);
    expect(months.map((w) => [isoDate(w.from), isoDate(w.to)])).toEqual([
      ["2026-07-01", "2026-07-31"],
      ["2026-08-01", "2026-08-31"],
      ["2026-09-01", "2026-09-30"],
    ]);
    expect(finishedPeriods("monthly", new Date("2026-10-01T00:00:00.000Z"), now)).toEqual([]);
  });

  it("counts weeks and financial years too, but not custom ranges", () => {
    expect(finishedPeriods("weekly", new Date("2026-10-07T00:00:00.000Z"), now).map((w) => isoDate(w.from))).toEqual(["2026-10-05", "2026-10-12"]);
    expect(finishedPeriods("yearly", new Date("2025-05-01T00:00:00.000Z"), now, 4).map((w) => isoDate(w.from))).toEqual(["2025-04-01"]);
    expect(finishedPeriods("custom", new Date("2020-01-01T00:00:00.000Z"), now)).toEqual([]);
  });

  it("stops at five years of months", () => {
    expect(finishedPeriods("monthly", new Date("2000-01-01T00:00:00.000Z"), now)).toHaveLength(60);
  });
});

describe("carriedIn", () => {
  it("carries unspent amounts, an overspend only wiping out what built up", () => {
    // Limit 100: spent 60, then 70, then 150.
    expect(carriedIn("unspent", 100, [60, 70])).toBe(70);
    expect(carriedIn("unspent", 100, [60, 70, 150])).toBe(20);
    expect(carriedIn("unspent", 100, [60, 200])).toBe(0);
  });

  it("carries overspending too when asked", () => {
    expect(carriedIn("both", 100, [60, 200])).toBe(-60);
    expect(carriedIn("both", 100, [])).toBe(0);
  });

  it("starts fresh by default", () => {
    expect(carriedIn("none", 100, [0, 0])).toBe(0);
  });
});
