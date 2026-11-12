import { describe, expect, it } from "vitest";
import { budgetSummary, budgetWindows, compareBudget } from "./budget-vs-actual";

describe("budget windows", () => {
  it("takes every period overlapping the range, in full", () => {
    expect(budgetWindows("monthly", "2026-08-15", "2026-10-10", { start: null, end: null })).toEqual([
      { from: "2026-08-01", to: "2026-08-31" },
      { from: "2026-09-01", to: "2026-09-30" },
      { from: "2026-10-01", to: "2026-10-31" },
    ]);
    expect(budgetWindows("weekly", "2026-10-28", "2026-11-03", { start: null, end: null })).toEqual([
      { from: "2026-10-26", to: "2026-11-01" },
      { from: "2026-11-02", to: "2026-11-08" },
    ]);
    expect(budgetWindows("yearly", "2026-02-01", "2026-05-01", { start: null, end: null }, 4)).toEqual([
      { from: "2025-04-01", to: "2026-03-31" },
      { from: "2026-04-01", to: "2027-03-31" },
    ]);
  });

  it("uses a custom budget's own dates when they overlap", () => {
    expect(budgetWindows("custom", "2026-10-01", "2026-10-31", { start: "2026-09-20", end: "2026-10-05" })).toEqual([{ from: "2026-09-20", to: "2026-10-05" }]);
    expect(budgetWindows("custom", "2026-10-01", "2026-10-31", { start: "2026-08-01", end: "2026-08-31" })).toEqual([]);
  });
});

describe("budget against actual", () => {
  const budget = { budgetId: "b", categoryId: "food", name: "Food", period: "monthly" as const, alertPct: 80 };
  const spent = new Map([
    ["2026-09-03", 30_000],
    ["2026-09-20", 25_000],
    ["2026-10-02", 10_000],
    ["2026-11-01", 999],
  ]);
  const report = compareBudget(
    budget,
    [
      { from: "2026-09-01", to: "2026-09-30", limitMinor: 50_000 },
      { from: "2026-10-01", to: "2026-10-31", limitMinor: 60_000 },
    ],
    spent,
    "2026-10-16",
  );

  it("compares each period with the limit it had", () => {
    expect(report.periods.map((p) => [p.spentMinor, p.varianceMinor, p.usedPct, p.status, p.inProgress])).toEqual([
      [55_000, -5_000, 110, "over", false],
      [10_000, 50_000, 17, "under", true],
    ]);
    expect(report.totals).toEqual({ limitMinor: 110_000, spentMinor: 65_000, varianceMinor: 45_000, usedPct: 59, overCount: 1 });
  });

  it("gives the running period an even pace to compare with", () => {
    // 16 of October's 31 days.
    expect(report.periods[1]!.paceMinor).toBe(Math.round((60_000 * 16) / 31));
    expect(report.periods[0]!.paceMinor).toBeNull();
  });

  it("flags near the alert line, and adds up with spending no budget covers", () => {
    const near = compareBudget(budget, [{ from: "2026-09-01", to: "2026-09-30", limitMinor: 60_000 }], spent, "2026-12-01");
    expect(near.periods[0]!.status).toBe("near");
    expect(budgetSummary([report], 80_000, 65_000)).toEqual({ limitMinor: 110_000, spentMinor: 65_000, varianceMinor: 45_000, overBudgets: 1, unbudgetedMinor: 15_000 });
  });
});
