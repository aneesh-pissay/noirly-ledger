import { describe, expect, it } from "vitest";
import { cashEffect, cashFlow, type CashEvent } from "@/src/core/cash-flow";

describe("cash flow", () => {
  it("counts only what moves money on hand", () => {
    expect(cashEffect({ type: "expense", amountMinor: 500 }, "bank", null)).toBe(-500);
    expect(cashEffect({ type: "expense", amountMinor: 500 }, "credit_card", null)).toBe(0);
    expect(cashEffect({ type: "expense", amountMinor: 500 }, "none", null)).toBe(-500);
    expect(cashEffect({ type: "income", amountMinor: 900 }, "wallet", null)).toBe(900);
    // Paying the card is when card spending leaves the bank.
    expect(cashEffect({ type: "transfer", amountMinor: 700 }, "bank", "credit_card")).toBe(-700);
    expect(cashEffect({ type: "transfer", amountMinor: 700 }, "bank", "wallet")).toBe(0);
    expect(cashEffect({ type: "transfer", amountMinor: 700, toAmountMinor: 690 }, "loan", "bank")).toBe(690);
  });

  it("runs day by day, finding the low point, the first shortfall and the bills before payday", () => {
    const events: CashEvent[] = [
      { date: "2026-10-24", deltaMinor: -1_000, label: "Overdue electricity", kind: "bill" },
      { date: "2026-10-27", deltaMinor: -25_000, label: "Rent", kind: "bill" },
      { date: "2026-10-29", deltaMinor: -3_000, label: "Netflix", kind: "bill" },
      { date: "2026-10-31", deltaMinor: 50_000, label: "Salary", kind: "income" },
      { date: "2026-11-02", deltaMinor: -2_000, label: "Gym", kind: "bill" },
    ];
    const flow = cashFlow(20_000, events, "2026-10-26", "2026-11-03");
    expect(flow.points.map((p) => p.balanceMinor)).toEqual([19_000, -6_000, -6_000, -9_000, -9_000, 41_000, 41_000, 39_000, 39_000]);
    expect(flow).toMatchObject({
      lowestMinor: -9_000,
      lowestDate: "2026-10-29",
      firstShortDate: "2026-10-27",
      nextIncomeDate: "2026-10-31",
      billsBeforeIncomeMinor: 29_000,
      inMinor: 50_000,
      outMinor: 31_000,
    });
  });

  it("stays put with nothing coming, and says so when there's no income ahead", () => {
    const flow = cashFlow(5_000, [], "2026-10-26", "2026-10-28");
    expect(flow.points).toEqual([
      { date: "2026-10-26", balanceMinor: 5_000 },
      { date: "2026-10-27", balanceMinor: 5_000 },
      { date: "2026-10-28", balanceMinor: 5_000 },
    ]);
    expect(flow).toMatchObject({ lowestMinor: 5_000, lowestDate: "2026-10-26", firstShortDate: null, nextIncomeDate: null, billsBeforeIncomeMinor: 0 });
  });
});
