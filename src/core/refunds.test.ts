import { describe, expect, it } from "vitest";
import { checkRefund, spendSign } from "@/src/core/refunds";

describe("spendSign", () => {
  it("counts expenses up and refunds down, and nothing else", () => {
    expect(spendSign("expense")).toBe(1);
    expect(spendSign("refund")).toBe(-1);
    expect(spendSign("income")).toBe(0);
    expect(spendSign("transfer")).toBe(0);
  });
});

describe("checkRefund", () => {
  const expense = { type: "expense" as const, currency: "INR", amountMinor: 10_000, budgetPoolId: null, isPosted: true };

  it("allows up to what's left of the expense", () => {
    expect(checkRefund({ original: expense, refundedMinor: 0, amountMinor: 10_000, currency: "inr" })).toEqual({ ok: true });
    expect(checkRefund({ original: expense, refundedMinor: 4_000, amountMinor: 6_000, currency: "INR" })).toEqual({ ok: true });
    expect(checkRefund({ original: expense, refundedMinor: 4_000, amountMinor: 6_001, currency: "INR" })).toEqual({ ok: false, error: "That's more than is left to refund" });
    expect(checkRefund({ original: expense, refundedMinor: 10_000, amountMinor: 1, currency: "INR" })).toEqual({ ok: false, error: "This expense is already fully refunded" });
  });

  it("only reverses your own posted expenses, in their currency", () => {
    expect(checkRefund({ original: null, refundedMinor: 0, amountMinor: 1, currency: "INR" }).ok).toBe(false);
    expect(checkRefund({ original: { ...expense, type: "income" }, refundedMinor: 0, amountMinor: 1, currency: "INR" })).toEqual({ ok: false, error: "Only an expense can be refunded" });
    expect(checkRefund({ original: { ...expense, budgetPoolId: "p" }, refundedMinor: 0, amountMinor: 1, currency: "INR" }).ok).toBe(false);
    expect(checkRefund({ original: expense, refundedMinor: 0, amountMinor: 1, currency: "USD" })).toEqual({ ok: false, error: "The expense was in INR; enter the refund in INR" });
  });
});
