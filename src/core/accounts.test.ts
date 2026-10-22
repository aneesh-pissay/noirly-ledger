import { describe, expect, it } from "vitest";
import { accountBalance, checkTransfer, isLiability } from "@/src/core/accounts";

describe("accountBalance", () => {
  const entries = [
    { type: "income" as const, amountMinor: 50_000 },
    { type: "expense" as const, amountMinor: 12_500 },
    { type: "transfer" as const, amountMinor: 9_999 },
  ];

  it("adds income and takes away spending for money you have", () => {
    expect(accountBalance("bank", 100_000, entries)).toBe(137_500);
    expect(accountBalance("cash", 0, [])).toBe(0);
  });

  it("counts what's owed for cards and loans: spending raises it, payments lower it", () => {
    expect(accountBalance("credit_card", 20_000, entries)).toBe(-17_500);
    expect(accountBalance("credit_card", 0, [{ type: "expense", amountMinor: 4_000 }])).toBe(4_000);
  });

  it("moves money with transfers: out of one account, into the other", () => {
    // Paying 300 of a 1,000 card bill from the bank.
    expect(accountBalance("bank", 5_000, [{ type: "transfer_out", amountMinor: 300 }])).toBe(4_700);
    expect(accountBalance("credit_card", 1_000, [{ type: "transfer_in", amountMinor: 300 }])).toBe(700);
    // A cash withdrawal on the card adds to what's owed.
    expect(accountBalance("credit_card", 0, [{ type: "transfer_out", amountMinor: 200 }])).toBe(200);
    expect(accountBalance("wallet", 0, [{ type: "transfer_in", amountMinor: 200 }])).toBe(200);
  });

  it("puts refunds back where the money came from", () => {
    expect(accountBalance("bank", 1_000, [{ type: "expense", amountMinor: 400 }, { type: "refund", amountMinor: 150 }])).toBe(750);
    expect(accountBalance("credit_card", 0, [{ type: "expense", amountMinor: 400 }, { type: "refund", amountMinor: 150 }])).toBe(250);
  });

  it("knows which kinds are liabilities", () => {
    expect(isLiability("loan")).toBe(true);
    expect(isLiability("wallet")).toBe(false);
  });
});

describe("checkTransfer", () => {
  const usd = { id: "a", currency: "USD" };
  const usd2 = { id: "b", currency: "USD" };
  const inr = { id: "c", currency: "INR" };

  it("needs two different accounts", () => {
    expect(checkTransfer({ from: usd, to: null, amountMinor: 100, toAmountMinor: null }).ok).toBe(false);
    expect(checkTransfer({ from: usd, to: usd, amountMinor: 100, toAmountMinor: null })).toEqual({ ok: false, error: "Pick two different accounts" });
  });

  it("receives the same amount in the same currency", () => {
    expect(checkTransfer({ from: usd, to: usd2, amountMinor: 100, toAmountMinor: null })).toEqual({ ok: true, toAmountMinor: 100 });
    expect(checkTransfer({ from: usd, to: usd2, amountMinor: 100, toAmountMinor: 90 }).ok).toBe(false);
  });

  it("asks for the amount received across currencies", () => {
    expect(checkTransfer({ from: usd, to: inr, amountMinor: 10_000, toAmountMinor: null })).toEqual({ ok: false, error: "Enter the amount received in INR" });
    expect(checkTransfer({ from: usd, to: inr, amountMinor: 10_000, toAmountMinor: 830_000 })).toEqual({ ok: true, toAmountMinor: 830_000 });
  });
});
