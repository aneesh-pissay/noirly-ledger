import { describe, expect, it } from "vitest";
import { monthOf, monthlyEquivalent, planSummary } from "@/src/core/budgets/zero-based";

describe("monthlyEquivalent", () => {
  it("brings each period to a month", () => {
    expect(monthlyEquivalent("monthly", 50_000)).toBe(50_000);
    expect(monthlyEquivalent("weekly", 12_000)).toBe(52_000);
    expect(monthlyEquivalent("yearly", 120_000)).toBe(10_000);
    expect(monthlyEquivalent("custom", 10_000)).toBeNull();
  });
});

describe("planSummary", () => {
  it("aims for nothing left to assign", () => {
    expect(planSummary(100_000, [60_000, 40_000])).toEqual({ assignedMinor: 100_000, leftMinor: 0, state: "balanced" });
    expect(planSummary(100_000, [60_000])).toEqual({ assignedMinor: 60_000, leftMinor: 40_000, state: "unassigned" });
    expect(planSummary(100_000, [60_000, 50_000]).state).toBe("overassigned");
    expect(planSummary(0, []).state).toBe("balanced");
  });
});

describe("monthOf", () => {
  it("names the month and its days", () => {
    expect(monthOf("2026-02-14")).toEqual({ key: "2026-02", from: "2026-02-01", to: "2026-02-28" });
    expect(monthOf("2028-02-01").to).toBe("2028-02-29");
  });
});
