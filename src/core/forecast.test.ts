import { describe, expect, it } from "vitest";
import { forecast, forecastSummary, monthAfter } from "@/src/core/forecast";

const baseline = { startCashMinor: 100_000, monthlyIncomeMinor: 500_000, spendingByCategory: { food: 200_000, rent: 250_000 } };

describe("monthAfter", () => {
  it("counts months on from today", () => {
    expect(monthAfter("2026-10-23", 1)).toBe("2026-11");
    expect(monthAfter("2026-10-23", 3)).toBe("2027-01");
  });
});

describe("forecast", () => {
  it("adds each month's income less spending to cash", () => {
    const rows = forecast(baseline, [], 3, "2026-10-23");
    expect(rows.map((r) => [r.month, r.netMinor, r.cashMinor])).toEqual([
      ["2026-11", 50_000, 150_000],
      ["2026-12", 50_000, 200_000],
      ["2027-01", 50_000, 250_000],
    ]);
  });

  it("applies changes from their month on", () => {
    const rows = forecast(baseline, [
      { kind: "income", pct: 10, fromMonth: 2 },
      { kind: "category", categoryId: "food", amountMinor: -50_000 },
      { kind: "category", categoryId: "travel", amountMinor: 30_000, fromMonth: 3 },
    ], 3, "2026-10-23");
    expect(rows.map((r) => [r.incomeMinor, r.spendingMinor])).toEqual([
      [500_000, 400_000],
      [550_000, 400_000],
      [550_000, 430_000],
    ]);
  });

  it("adds one-off and repeating amounts, and a category can't spend below zero", () => {
    const rows = forecast(baseline, [
      { kind: "one_off", amountMinor: -300_000, month: 2, label: "Laptop" },
      { kind: "recurring", amountMinor: -20_000, fromMonth: 1, months: 2, label: "EMI" },
      { kind: "category", categoryId: "food", pct: -150 },
    ], 3, "2026-10-23");
    expect(rows.map((r) => r.otherMinor)).toEqual([-20_000, -320_000, 0]);
    expect(rows[0]!.spendingMinor).toBe(250_000);
  });
});

describe("forecastSummary", () => {
  it("finds the end, the low point and when cash runs out", () => {
    const rows = forecast(baseline, [{ kind: "one_off", amountMinor: -400_000, month: 2 }], 4, "2026-10-23");
    expect(forecastSummary(rows, baseline.startCashMinor)).toEqual({
      endCashMinor: -100_000,
      lowest: { month: "2026-12", cashMinor: -200_000 },
      firstNegativeMonth: "2026-12",
    });
    expect(forecastSummary([], 5)).toEqual({ endCashMinor: 5, lowest: { month: null, cashMinor: 5 }, firstNegativeMonth: null });
  });
});
