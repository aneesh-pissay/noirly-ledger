import { describe, expect, it } from "vitest";
import { BUILT_IN_TEMPLATES, needsIncome, renewedRange, templateLimits } from "@/src/core/budgets/templates";
import { DEFAULT_CATEGORIES } from "@/src/core/categories/defaults";

describe("templateLimits", () => {
  it("shares income out by percent, in whole units", () => {
    const lines = [
      { categoryName: "Housing", period: "monthly" as const, sharePct: 25 },
      { categoryName: "Fun", period: "weekly" as const, limitMinor: 5_000 },
    ];
    expect(needsIncome(lines)).toBe(true);
    expect(templateLimits(lines, 5_000_000)).toEqual([1_250_000, 5_000]);
    expect(templateLimits(lines, 333_33)).toEqual([8_300, 5_000]);
    expect(() => templateLimits(lines, null)).toThrow("enter your monthly income");
    expect(templateLimits([lines[1]!], null)).toEqual([5_000]);
  });

  it("built-in templates use the starting categories and leave some income unplanned", () => {
    const names = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
    for (const template of BUILT_IN_TEMPLATES) {
      expect(template.lines.every((line) => names.has(line.categoryName))).toBe(true);
      expect(template.lines.reduce((sum, line) => sum + (line.sharePct ?? 0), 0)).toBeLessThanOrEqual(80);
    }
  });
});

describe("renewedRange", () => {
  it("moves a finished range on by its own length until it reaches today", () => {
    // A 14-day range.
    expect(renewedRange("2026-10-01", "2026-10-14", "2026-10-15")).toEqual({ start: "2026-10-15", end: "2026-10-28" });
    expect(renewedRange("2026-10-01", "2026-10-14", "2026-11-20")).toEqual({ start: "2026-11-12", end: "2026-11-25" });
    expect(renewedRange("2026-10-01", "2026-10-14", "2026-10-14")).toBeNull();
  });
});
