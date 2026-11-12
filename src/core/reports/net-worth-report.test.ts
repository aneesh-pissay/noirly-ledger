import { describe, expect, it } from "vitest";
import { debtFreeMonth, debtProgress, netWorthReport, type AccountBalances } from "./net-worth-report";
import { periods } from "./periods";

const list = periods("2026-08-01", "2026-10-31", "month");
// Balances at the start (31 Jul), then the ends of Aug, Sep and Oct.
const accounts: AccountBalances[] = [
  { id: "bank", name: "Bank", kind: "bank", balances: [100_000, 120_000, 110_000, 150_000] },
  { id: "card", name: "Card", kind: "credit_card", balances: [30_000, 25_000, 40_000, 10_000] },
  { id: "loan", name: "Car loan", kind: "loan", balances: [500_000, 490_000, 480_000, 470_000] },
  // Opened in September.
  { id: "wallet", name: "Wallet", kind: "wallet", balances: [null, null, 5_000, 5_000] },
];

describe("net worth report", () => {
  const r = netWorthReport(accounts, list);

  it("reads net worth at the start and each period's end", () => {
    expect(r.start).toEqual({ assetsMinor: 100_000, liabilitiesMinor: 530_000, netMinor: -430_000 });
    expect(r.rows.map((x) => [x.label, x.netMinor, x.changeMinor])).toEqual([
      ["Aug 2026", -395_000, 35_000],
      ["Sep 2026", -405_000, -10_000],
      ["Oct 2026", -325_000, 80_000],
    ]);
    expect(r.end.netMinor).toBe(-325_000);
    expect(r.changeMinor).toBe(105_000);
  });

  it("ranks accounts by how much they moved net worth", () => {
    expect(r.movers.map((m) => [m.name, m.changeMinor, m.effectOnNetMinor])).toEqual([
      ["Bank", 50_000, 50_000],
      ["Car loan", -30_000, 30_000],
      ["Card", -20_000, 20_000],
      ["Wallet", 5_000, 5_000],
    ]);
    expect(r.byKind[0]).toEqual({ kind: "loan", balanceMinor: 470_000 });
  });
});

describe("debt progress", () => {
  const d = debtProgress(accounts, [{ accountId: "card", paidMinor: 60_000, chargedMinor: 40_000 }, { accountId: "loan", paidMinor: 36_000, chargedMinor: 6_000 }], list);

  it("shows each debt's start, end, payments and new charges", () => {
    expect(d.debts.map((x) => [x.name, x.startMinor, x.endMinor, x.paidMinor, x.chargedMinor, x.paidDownPct])).toEqual([
      ["Car loan", 500_000, 470_000, 36_000, 6_000, 6],
      ["Card", 30_000, 10_000, 60_000, 40_000, 67],
    ]);
    expect(d.totals).toEqual({ startMinor: 530_000, endMinor: 480_000, paidMinor: 96_000, chargedMinor: 46_000, changeMinor: -50_000 });
    expect(d.rows.map((x) => x.owedMinor)).toEqual([515_000, 520_000, 480_000]);
  });

  it("dates a plan's end", () => {
    expect(debtFreeMonth("2026-10-31", 14)).toBe("2027-12");
    expect(debtFreeMonth("2026-10-31", null)).toBeNull();
  });
});
