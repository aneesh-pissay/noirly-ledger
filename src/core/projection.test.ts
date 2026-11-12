import { describe, expect, it } from "vitest";
import { addDays, availableToSpend, projectAccount, unassignedEffect } from "@/src/core/projection";

describe("addDays", () => {
  it("counts across months and years", () => {
    expect(addDays("2026-10-22", 30)).toBe("2026-11-21");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("projectAccount", () => {
  it("lands where the upcoming items take it, and finds the dip before payday", () => {
    const upcoming = [
      { date: "2026-11-01", type: "expense" as const, amountMinor: 1_200 },
      { date: "2026-11-05", type: "transfer_out" as const, amountMinor: 100 },
      { date: "2026-11-15", type: "income" as const, amountMinor: 3_000 },
    ];
    expect(projectAccount("bank", 1_000, upcoming)).toEqual({ projectedMinor: 2_700, lowestMinor: -300, lowestDate: "2026-11-05" });
  });

  it("tracks the most owed on a card", () => {
    const upcoming = [
      { date: "2026-11-02", type: "expense" as const, amountMinor: 50 },
      { date: "2026-11-10", type: "transfer_in" as const, amountMinor: 400 },
    ];
    expect(projectAccount("credit_card", 400, upcoming)).toEqual({ projectedMinor: 50, lowestMinor: 450, lowestDate: "2026-11-02" });
  });

  it("stays put with nothing coming", () => {
    expect(projectAccount("cash", 70, [])).toEqual({ projectedMinor: 70, lowestMinor: 70, lowestDate: null });
  });
});

describe("availableToSpend", () => {
  it("is cash and bank less what's owed on cards, leaving loans aside", () => {
    expect(
      availableToSpend(
        [
          { kind: "bank", projectedBaseMinor: 5_000 },
          { kind: "wallet", projectedBaseMinor: 300 },
          { kind: "credit_card", projectedBaseMinor: 1_200 },
          { kind: "loan", projectedBaseMinor: 90_000 },
        ],
        -500,
      ),
    ).toBe(3_600);
  });

  it("counts upcoming items without an account", () => {
    expect(unassignedEffect("income", 10)).toBe(10);
    expect(unassignedEffect("expense", 10)).toBe(-10);
    expect(unassignedEffect("refund", 10)).toBe(10);
    expect(unassignedEffect("transfer", 10)).toBe(0);
  });
});
