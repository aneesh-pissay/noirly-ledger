import { describe, expect, it } from "vitest";
import { accountBalance, isLiability } from "@/src/core/accounts";

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

  it("knows which kinds are liabilities", () => {
    expect(isLiability("loan")).toBe(true);
    expect(isLiability("wallet")).toBe(false);
  });
});
