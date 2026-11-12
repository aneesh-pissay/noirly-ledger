import { describe, expect, it } from "vitest";
import { analyseSpending, changePct, previousRange, type CategoryInfo, type SpendLine } from "./spending";
import { periods } from "./periods";

const cats: CategoryInfo[] = [
  { id: "food", name: "Food", color: "#f00", parentId: null },
  { id: "dining", name: "Dining out", color: "#f00", parentId: "food" },
  { id: "groceries", name: "Groceries", color: "#f00", parentId: "food" },
  { id: "travel", name: "Travel", color: "#00f", parentId: null },
];

const line = (over: Partial<SpendLine>): SpendLine => ({ date: "2026-10-05", categoryId: null, merchantKey: null, merchantName: null, amountMinor: 0, count: 1, ...over });

describe("spending analysis", () => {
  const list = periods("2026-10-01", "2026-10-31", "week");
  const current = [
    line({ categoryId: "dining", merchantKey: "cafe", merchantName: "Cafe", amountMinor: 3_000 }),
    line({ categoryId: "dining", merchantKey: "cafe", merchantName: "Cafe", amountMinor: 2_000, date: "2026-10-20" }),
    line({ categoryId: "groceries", merchantKey: "mart", merchantName: "Mart", amountMinor: 4_000 }),
    line({ categoryId: "food", merchantKey: "mart", merchantName: "Mart", amountMinor: 1_000 }),
    // A refund at the mart: takes spending back, isn't an expense.
    line({ categoryId: "groceries", merchantKey: "mart", merchantName: "Mart", amountMinor: -500, count: 0 }),
    line({ categoryId: "travel", amountMinor: 10_000 }),
    line({ categoryId: null, merchantKey: "kiosk", merchantName: "Kiosk", amountMinor: 500 }),
  ];
  const previous = [line({ categoryId: "groceries", amountMinor: 5_000 }), line({ categoryId: "travel", amountMinor: 20_000 })];
  const a = analyseSpending({ current, previous, categories: cats, periods: list, topMerchants: 1, topSeries: 2 });

  it("totals, against the period before", () => {
    expect(a.totalMinor).toBe(20_000);
    expect(a.previousTotalMinor).toBe(25_000);
    expect(a.changePct).toBe(-20);
    expect(a.count).toBe(6);
  });

  it("rolls subcategories up into their category, the parent's own spend as a line", () => {
    expect(a.categories.map((c) => [c.key, c.amountMinor, c.sharePct, c.changePct])).toEqual([
      ["travel", 10_000, 50, -50],
      ["food", 9_500, 47.5, 90],
      ["uncategorized", 500, 2.5, null],
    ]);
    const food = a.categories.find((c) => c.key === "food")!;
    expect(food.children.map((c) => [c.name, c.amountMinor, c.count, c.averageMinor])).toEqual([
      ["Dining out", 5_000, 2, 2_500],
      ["Groceries", 3_500, 1, 3_500],
      ["Food (general)", 1_000, 1, 1_000],
    ]);
    expect(a.categories.find((c) => c.key === "travel")!.children).toEqual([]);
  });

  it("lists the top merchants, then the rest together", () => {
    expect(a.merchants.map((m) => [m.name, m.amountMinor, m.count])).toEqual([
      ["Cafe", 5_000, 2],
      // Mart, the kiosk, and travel with no merchant.
      ["All others", 15_000, 4],
    ]);
  });

  it("charts the top categories by period", () => {
    expect(a.series.periods).toHaveLength(list.length);
    const food = a.series.categories.find((c) => c.key === "food")!;
    expect(food.values.reduce((s, v) => s + v, 0)).toBe(9_500);
    expect(a.series.categories.map((c) => c.key)).toEqual(["travel", "food"]);
  });

  it("compares with the same number of days just before", () => {
    expect(previousRange("2026-10-01", "2026-10-31")).toEqual({ from: "2026-08-31", to: "2026-09-30" });
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(10, 0)).toBeNull();
  });
});
