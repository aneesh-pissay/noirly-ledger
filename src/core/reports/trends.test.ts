import { describe, expect, it } from "vitest";
import { trends, trendRows, yearEarlier } from "./trends";
import { incomeVsExpense } from "./cash-flow-report";
import { periods } from "./periods";
import type { CategoryInfo, SpendLine } from "./spending";

const list = periods("2026-06-01", "2026-10-31", "month");
const spend = (date: string, amountMinor: number) => ({ date, type: "expense" as const, amountMinor });
const rows = incomeVsExpense(
  [spend("2026-06-10", 10_000), spend("2026-07-10", 12_000), spend("2026-08-10", 9_000), spend("2026-09-10", 18_000), spend("2026-10-02", 1_000), { date: "2026-09-01", type: "income", amountMinor: 50_000 }],
  list,
).rows;

describe("trend rows", () => {
  it("compares each finished period with the one before and a year earlier, and smooths spending", () => {
    const yearAgo = incomeVsExpense([spend("2025-09-05", 20_000)], periods("2025-06-01", "2025-10-31", "month")).rows;
    const t = trendRows(rows, yearAgo, "2026-10-16");
    expect(t.map((r) => [r.label, r.spendingChangePct, r.spendingYearChangePct, r.spendingAverageMinor, r.inProgress])).toEqual([
      ["Jun 2026", null, null, null, false],
      ["Jul 2026", 20, null, null, false],
      ["Aug 2026", -25, null, 10_333, false],
      ["Sep 2026", 100, -10, 13_000, false],
      // Still running: shown, not compared.
      ["Oct 2026", null, null, 9_333, true],
    ]);
    expect(t[3]!.incomeChangePct).toBeNull();
  });
});

describe("category movers", () => {
  const cats: CategoryInfo[] = [
    { id: "food", name: "Food", color: "#1", parentId: null },
    { id: "cafe", name: "Cafe", color: "#1", parentId: "food" },
    { id: "rent", name: "Rent", color: "#2", parentId: null },
    { id: "fun", name: "Fun", color: "#3", parentId: null },
  ];
  const line = (date: string, categoryId: string, amountMinor: number): SpendLine => ({ date, categoryId, merchantKey: null, merchantName: null, amountMinor, count: 1 });
  const lines = [
    line("2026-06-05", "food", 1_000), line("2026-07-05", "cafe", 2_000), line("2026-08-05", "food", 3_000), line("2026-09-05", "cafe", 4_000),
    line("2026-08-05", "rent", 50_000), line("2026-09-05", "rent", 40_000),
    line("2026-09-05", "fun", 500),
    line("2026-10-05", "fun", 99_999),
  ];
  const t = trends({ rows, yearAgo: null, lines, categories: cats, periods: list, today: "2026-10-16" });

  it("compares the last two finished periods, not the one running", () => {
    expect(t.compared).toEqual({ from: "Aug 2026", to: "Sep 2026" });
    expect(t.risers.map((m) => [m.name, m.changeMinor, m.changePct])).toEqual([["Food", 1_000, 33], ["Fun", 500, null]]);
    expect(t.fallers.map((m) => [m.name, m.changeMinor])).toEqual([["Rent", -10_000]]);
  });

  it("names categories rising period after period", () => {
    expect(t.rising).toEqual([{ key: "food", name: "Food", streak: 4 }]);
  });

  it("has nothing to compare with one finished period", () => {
    expect(trends({ rows: rows.slice(0, 1), yearAgo: null, lines, categories: cats, periods: list.slice(0, 1), today: "2026-10-16" }).compared).toBeNull();
  });
});

describe("a year earlier", () => {
  it("shifts the range back a year, 29 Feb to 28 Feb", () => {
    expect(yearEarlier("2026-01-01", "2026-12-31")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(yearEarlier("2024-02-29", "2024-03-31")).toEqual({ from: "2023-02-28", to: "2023-03-31" });
  });
});
