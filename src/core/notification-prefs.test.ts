import { describe, expect, it } from "vitest";
import { crossedLevel, defaultPrefs, isLargeExpense, prefsProblem, topicOf, withDefaults } from "./notification-prefs";

describe("notification preferences", () => {
  it("fills in what isn't stored, and sorts levels", () => {
    const p = withDefaults({ channels: { budgets: { inApp: true, email: false } } as never, budgetLevels: [90, 50, 90] });
    expect(p.channels.budgets).toEqual({ inApp: true, email: false });
    expect(p.channels.bills).toEqual({ inApp: true, email: true });
    expect(p.budgetLevels).toEqual([50, 90]);
    expect(p.billDaysBefore).toBe(2);
    expect(withDefaults(null)).toEqual(defaultPrefs());
  });

  it("checks levels, days and amounts", () => {
    expect(prefsProblem(defaultPrefs())).toBeNull();
    expect(prefsProblem({ ...defaultPrefs(), budgetLevels: [0] })).toMatch(/1 to 200/);
    expect(prefsProblem({ ...defaultPrefs(), budgetLevels: [10, 20, 30, 40, 50, 60] })).toMatch(/Up to 5/);
    expect(prefsProblem({ ...defaultPrefs(), billDaysBefore: 31 })).toMatch(/0 to 30/);
    expect(prefsProblem({ ...defaultPrefs(), largeExpenseMinor: 0 })).toMatch(/above zero/);
  });

  it("tells once, at the highest level crossed", () => {
    expect(crossedLevel([50, 80, 100], 4_000, 8_500, 10_000)).toBe(80);
    expect(crossedLevel([50, 80, 100], 8_500, 9_000, 10_000)).toBeNull();
    expect(crossedLevel([50, 80, 100], 9_000, 12_000, 10_000)).toBe(100);
    expect(crossedLevel([50], 0, 100, 0)).toBeNull();
  });

  it("groups kinds into topics and spots large expenses", () => {
    expect(topicOf("recurring.due")).toBe("bills");
    expect(topicOf("pool.contribution")).toBe("goals");
    expect(isLargeExpense({ largeExpenseMinor: 50_000 }, 50_000)).toBe(true);
    expect(isLargeExpense({ largeExpenseMinor: 50_000 }, 49_999)).toBe(false);
    expect(isLargeExpense({ largeExpenseMinor: null }, 1_000_000)).toBe(false);
  });
});
