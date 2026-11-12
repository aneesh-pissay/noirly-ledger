import { describe, expect, it } from "vitest";
import { categoryVariance, earlierStretches, mad, median, savingsAnalysis, unusualSpending, type SpendTxn } from "./insights";

const money = (m: number) => `$${m / 100}`;
const txn = (over: Partial<SpendTxn>): SpendTxn => ({ id: "t", date: "2026-10-10", amountMinor: 1_000, categoryKey: "food", categoryName: "Food", merchantKey: null, merchantName: null, note: null, ...over });

describe("medians", () => {
  it("are the middle value, and the usual distance from it", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBe(0);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });
});

describe("unusual spending", () => {
  const history = [
    ...[400, 450, 500, 420].map((a) => txn({ amountMinor: a, merchantKey: "cafe", merchantName: "Cafe" })),
    ...[2_000, 2_500, 3_000, 2_200, 2_800, 99_000].map((a) => txn({ amountMinor: a, categoryKey: "fuel", categoryName: "Fuel" })),
  ];

  it("flags an expense far above its merchant's usual, then its category's", () => {
    const found = unusualSpending(
      [
        txn({ id: "big-cafe", amountMinor: 2_400, merchantKey: "cafe", merchantName: "Cafe" }),
        txn({ id: "ok-cafe", amountMinor: 1_200, merchantKey: "cafe", merchantName: "Cafe" }),
        // A new merchant: judged by its category, whose one huge outlier doesn't hide this.
        txn({ id: "big-fuel", amountMinor: 12_000, categoryKey: "fuel", categoryName: "Fuel", merchantKey: "new-pump" }),
        // No history to judge by.
        txn({ id: "unknown", amountMinor: 50_000, categoryKey: "toys", categoryName: "Toys" }),
      ],
      history,
      money,
    );
    expect(found.map((u) => [u.id, u.basis, u.timesUsual])).toEqual([
      // Usual: 4.35 at the cafe (median of four), 26.50 for fuel (the 990 outlier barely moves it).
      ["big-cafe", "merchant", 5.5],
      ["big-fuel", "category", 4.5],
    ]);
    expect(found[0]!.reason).toBe("5.5× the usual $4.35 at Cafe");
  });

  it("leaves small amounts alone", () => {
    expect(unusualSpending([txn({ amountMinor: 900, merchantKey: "cafe" })], history, money)).toEqual([]);
  });
});

describe("category variance", () => {
  const names = new Map([["food", "Food"], ["fun", "Fun"], ["rent", "Rent"], ["gifts", "Gifts"]]);
  const baseline = [
    new Map([["food", 10_000], ["fun", 5_000], ["rent", 50_000]]),
    new Map([["food", 12_000], ["fun", 5_000], ["rent", 50_000]]),
    new Map([["food", 11_000], ["fun", 5_000], ["rent", 50_000]]),
  ];
  const v = categoryVariance(new Map([["food", 20_000], ["fun", 2_000], ["rent", 50_500], ["gifts", 3_000]]), baseline, names);

  it("compares each category with its usual, biggest moves first", () => {
    expect(v.map((x) => [x.name, x.expectedMinor, x.varianceMinor, x.variancePct, x.flagged, x.spike])).toEqual([
      ["Food", 11_000, 9_000, 82, true, true],
      ["Fun", 5_000, -3_000, -60, true, false],
      // Nothing before, so anything at all is outside the usual.
      ["Gifts", 0, 3_000, null, true, true],
      ["Rent", 50_000, 500, 1, false, false],
    ]);
  });

  it("works out savings, the yearly pace, and what bringing risers back would save", () => {
    const s = savingsAnalysis({ incomeMinor: 100_000, expenseMinor: 75_500 }, [{ incomeMinor: 100_000, expenseMinor: 66_000 }, { incomeMinor: 100_000, expenseMinor: 67_000 }], v, 30);
    expect(s).toMatchObject({ netMinor: 24_500, savingsRatePct: 25, usualSavingsRatePct: 34, usualExpenseMinor: 66_500, yearlyAtThisPaceMinor: Math.round((24_500 * 365) / 30) });
    expect(s.potentialMinor).toBe(12_000);
    expect(s.potentialFrom.map((p) => p.name)).toEqual(["Food", "Gifts"]);
  });

  it("finds the stretches just before, latest first", () => {
    expect(earlierStretches("2026-10-01", "2026-10-31", 2)).toEqual([
      { from: "2026-08-31", to: "2026-09-30" },
      { from: "2026-07-31", to: "2026-08-30" },
    ]);
  });
});
