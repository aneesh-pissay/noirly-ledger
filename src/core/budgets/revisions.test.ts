import { describe, expect, it } from "vitest";
import { checkBudgetMove, limitAt } from "@/src/core/budgets/revisions";
import { carriedIn } from "@/src/core/budgets/rollover";

const at = (day: string) => new Date(`${day}T12:00:00.000Z`);

describe("limitAt", () => {
  const revisions = [
    { at: at("2026-08-10"), previousLimitMinor: 10_000, limitMinor: 15_000 },
    { at: at("2026-09-05"), previousLimitMinor: 15_000, limitMinor: 12_000 },
  ];

  it("finds the limit in force at a moment", () => {
    expect(limitAt(revisions, at("2026-08-31"), 12_000)).toBe(15_000);
    expect(limitAt(revisions, at("2026-09-30"), 12_000)).toBe(12_000);
    // Before the first recorded change: what it was changed from.
    expect(limitAt(revisions, at("2026-07-31"), 12_000)).toBe(10_000);
    expect(limitAt([], at("2026-07-31"), 12_000)).toBe(12_000);
  });
});

describe("carriedIn with changing limits", () => {
  it("measures each period against its own limit", () => {
    // Limits 150 then 120; spent 100 then 100.
    expect(carriedIn("unspent", [15_000, 12_000], [10_000, 10_000])).toBe(7_000);
    expect(carriedIn("unspent", 10_000, [6_000, 7_000])).toBe(7_000);
  });
});

describe("checkBudgetMove", () => {
  const food = { id: "f", period: "monthly" as const, limitMinor: 10_000, currency: "USD" };
  const fun = { id: "u", period: "monthly" as const, currency: "USD" };

  it("moves within the limit between budgets of the same period", () => {
    expect(checkBudgetMove({ from: food, to: fun, amountMinor: 10_000 })).toEqual({ ok: true });
    expect(checkBudgetMove({ from: food, to: fun, amountMinor: 10_001 })).toEqual({ ok: false, error: "That's more than the budget's whole limit" });
    expect(checkBudgetMove({ from: food, to: { ...fun, period: "weekly" }, amountMinor: 1 })).toEqual({ ok: false, error: "Both budgets need the same period; one is monthly, the other weekly" });
    expect(checkBudgetMove({ from: food, to: { ...food }, amountMinor: 1 }).ok).toBe(false);
    expect(checkBudgetMove({ from: food, to: null, amountMinor: 1 }).ok).toBe(false);
  });
});
