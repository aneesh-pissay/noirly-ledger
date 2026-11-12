import { describe, expect, it } from "vitest";
import { automationProblem, DEFAULT_PARAMS, digestText, refreshedLimit, sweepAmount } from "./automations";

const money = (m: number) => `$${(m / 100).toFixed(2)}`;

describe("automations", () => {
  it("checks what each kind needs", () => {
    expect(automationProblem("digest", "weekly", DEFAULT_PARAMS)).toMatch(/who/);
    expect(automationProblem("digest", "weekly", { ...DEFAULT_PARAMS, recipientIds: ["a"] })).toBeNull();
    expect(automationProblem("budget_refresh", "weekly", DEFAULT_PARAMS)).toMatch(/monthly/);
    expect(automationProblem("budget_refresh", "monthly", { ...DEFAULT_PARAMS, months: 13 })).toMatch(/12/);
    expect(automationProblem("budget_refresh", "monthly", { ...DEFAULT_PARAMS, adjustPct: -60 })).toMatch(/−50/);
    expect(automationProblem("sweep", "monthly", DEFAULT_PARAMS)).toMatch(/goal/);
    expect(automationProblem("sweep", "monthly", { ...DEFAULT_PARAMS, goalId: "g", sweepPct: 0 })).toMatch(/1%/);
  });

  it("refreshes a budget to the average spent, adjusted and rounded up", () => {
    expect(refreshedLimit([30_000, 36_000, 33_000], 0)).toBe(33_000);
    expect(refreshedLimit([30_000, 36_050, 33_000], 10)).toBe(36_400);
    // A month with nothing spent still counts in the average.
    expect(refreshedLimit([0, 0, 30_000], 0)).toBe(10_000);
    expect(refreshedLimit([0, 0], 0)).toBeNull();
    expect(refreshedLimit([], 0)).toBeNull();
  });

  it("sweeps a share of what's unspent; overspending counts as nothing", () => {
    expect(sweepAmount([{ limitMinor: 50_000, spentMinor: 30_000 }, { limitMinor: 10_000, spentMinor: 15_000 }, { limitMinor: 5_001, spentMinor: 0 }], 50)).toBe(12_500);
    expect(sweepAmount([], 100)).toBe(0);
  });

  it("writes the digest", () => {
    const d = digestText(
      {
        from: "2026-10-01",
        to: "2026-10-31",
        incomeMinor: 100_000,
        expenseMinor: 70_000,
        savingsRatePct: 30,
        changePct: -5,
        topCategories: [{ name: "Rent", amountMinor: 40_000 }, { name: "Food", amountMinor: 20_000 }],
        overBudgets: [{ name: "Food", overMinor: 2_000 }],
        unusual: [],
      },
      money,
    );
    expect(d.title).toBe("Your digest, 2026-10-01 to 2026-10-31");
    expect(d.body).toBe("Income $1000.00, spending $700.00 (-5% on before), kept $300.00 (30% of income). Most went on Rent $400.00, Food $200.00. Over budget: Food by $20.00.");
  });
});
