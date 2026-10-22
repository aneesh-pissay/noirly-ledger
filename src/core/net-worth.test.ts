import { describe, expect, it } from "vitest";
import { balancesOn, historyDays, netWorth } from "@/src/core/net-worth";

describe("historyDays", () => {
  it("ends each earlier month, then today", () => {
    expect(historyDays("2026-03-15", 3)).toEqual(["2025-12-31", "2026-01-31", "2026-02-28", "2026-03-15"]);
    expect(historyDays("2028-03-01", 1)).toEqual(["2028-02-29", "2028-03-01"]);
  });
});

describe("balancesOn", () => {
  const entries = [
    { date: "2026-01-10", type: "income" as const, amountMinor: 500 },
    { date: "2026-02-03", type: "expense" as const, amountMinor: 200 },
    { date: "2026-02-20", type: "transfer_out" as const, amountMinor: 100 },
  ];

  it("follows the balance day by day, from the day it opened", () => {
    const days = ["2025-12-31", "2026-01-31", "2026-02-10", "2026-02-28"];
    expect(balancesOn({ kind: "bank", openingMinor: 1_000, openingDate: "2026-01-01" }, entries, days)).toEqual([null, 1_500, 1_300, 1_200]);
  });

  it("counts what's owed on cards", () => {
    const card = [{ date: "2026-01-05", type: "expense" as const, amountMinor: 300 }];
    expect(balancesOn({ kind: "credit_card", openingMinor: 0, openingDate: "2026-01-01" }, card, ["2026-01-04", "2026-01-05"])).toEqual([0, 300]);
  });
});

describe("netWorth", () => {
  it("is what you have minus what you owe", () => {
    expect(
      netWorth([
        { kind: "bank", baseBalanceMinor: 10_000 },
        { kind: "cash", baseBalanceMinor: -500 },
        { kind: "credit_card", baseBalanceMinor: 2_000 },
        { kind: "loan", baseBalanceMinor: 50_000 },
      ]),
    ).toEqual({ assetsMinor: 9_500, liabilitiesMinor: 52_000, netMinor: -42_500 });
    expect(netWorth([])).toEqual({ assetsMinor: 0, liabilitiesMinor: 0, netMinor: 0 });
  });
});
