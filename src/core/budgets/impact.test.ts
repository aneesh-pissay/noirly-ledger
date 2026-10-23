import { describe, expect, it } from "vitest";
import { budgetImpact, worstImpact } from "@/src/core/budgets/impact";

describe("budgetImpact", () => {
  const budget = { availableMinor: 10_000, spentMinor: 6_000, alertThresholdPct: 80 };

  it("leaves what's left, and says when it's near or over", () => {
    expect(budgetImpact({ ...budget, addMinor: 1_000 })).toEqual({ leftMinor: 3_000, state: "ok", alreadyOver: false });
    expect(budgetImpact({ ...budget, addMinor: 2_000 })).toEqual({ leftMinor: 2_000, state: "near", alreadyOver: false });
    expect(budgetImpact({ ...budget, addMinor: 4_000 }).state).toBe("near");
    expect(budgetImpact({ ...budget, addMinor: 4_001 })).toEqual({ leftMinor: -1, state: "over", alreadyOver: false });
  });

  it("knows a budget that was already over", () => {
    expect(budgetImpact({ ...budget, spentMinor: 12_000, addMinor: 100 })).toEqual({ leftMinor: -2_100, state: "over", alreadyOver: true });
  });
});

describe("worstImpact", () => {
  it("picks over before near before fine, then the least left", () => {
    expect(worstImpact([{ state: "near" as const, leftMinor: 5 }, { state: "over" as const, leftMinor: -1 }])?.state).toBe("over");
    expect(worstImpact([{ state: "ok" as const, leftMinor: 50 }, { state: "ok" as const, leftMinor: 20 }])?.leftMinor).toBe(20);
    expect(worstImpact([])).toBeNull();
  });
});
