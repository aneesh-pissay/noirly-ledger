import { describe, expect, it } from "vitest";
import { checkMove, envelopeBalance, readyToAssign } from "@/src/core/envelopes";

describe("readyToAssign", () => {
  it("is cash less card debt less what's in envelopes", () => {
    expect(readyToAssign({ cashMinor: 100_000, cardDebtMinor: 0, envelopeBalancesMinor: [] })).toBe(100_000);
    expect(readyToAssign({ cashMinor: 100_000, cardDebtMinor: 20_000, envelopeBalancesMinor: [30_000, 10_000] })).toBe(40_000);
  });

  it("doesn't move when money is spent, from the bank or on a card", () => {
    const before = readyToAssign({ cashMinor: 100_000, cardDebtMinor: 0, envelopeBalancesMinor: [envelopeBalance(30_000, 0)] });
    // 5,000 spent from the bank out of the 30,000 envelope.
    expect(readyToAssign({ cashMinor: 95_000, cardDebtMinor: 0, envelopeBalancesMinor: [envelopeBalance(30_000, 5_000)] })).toBe(before);
    // ... or on a card instead.
    expect(readyToAssign({ cashMinor: 100_000, cardDebtMinor: 5_000, envelopeBalancesMinor: [envelopeBalance(30_000, 5_000)] })).toBe(before);
  });
});

describe("checkMove", () => {
  it("moves no more than the source holds, somewhere else", () => {
    expect(checkMove({ fromId: null, toId: "food", amountMinor: 500, availableMinor: 500 })).toEqual({ ok: true });
    expect(checkMove({ fromId: null, toId: "food", amountMinor: 501, availableMinor: 500 })).toEqual({ ok: false, error: "That's more than is ready to assign" });
    expect(checkMove({ fromId: "food", toId: "fun", amountMinor: 900, availableMinor: 100 })).toEqual({ ok: false, error: "That's more than the envelope holds" });
    expect(checkMove({ fromId: "food", toId: "food", amountMinor: 1, availableMinor: 100 }).ok).toBe(false);
    expect(checkMove({ fromId: "food", toId: null, amountMinor: 0, availableMinor: 100 }).ok).toBe(false);
  });
});
