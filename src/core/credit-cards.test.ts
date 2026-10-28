import { describe, expect, it } from "vitest";
import { cardBill, cardCycle } from "@/src/core/credit-cards";

const terms = { statementDay: 15, dueDays: 20, creditLimitMinor: 10_000_000, minimumPct: 5 };

describe("credit card statements", () => {
  it("finds the last and next statement dates", () => {
    expect(cardCycle("2026-10-28", 15)).toEqual({ lastStatement: "2026-10-15", nextStatement: "2026-11-15" });
    expect(cardCycle("2026-10-10", 15)).toEqual({ lastStatement: "2026-09-15", nextStatement: "2026-10-15" });
    expect(cardCycle("2026-10-15", 15)).toEqual({ lastStatement: "2026-10-15", nextStatement: "2026-11-15" });
    // A month-end statement day stays at each month's end.
    expect(cardCycle("2026-03-10", 31)).toEqual({ lastStatement: "2026-02-28", nextStatement: "2026-03-31" });
    expect(cardCycle("2026-01-05", 20)).toEqual({ lastStatement: "2025-12-20", nextStatement: "2026-01-20" });
  });

  it("works out what's due, the minimum and how much of the limit is used", () => {
    const bill = cardBill(terms, { statementBalanceMinor: 4_210_050, paidSinceMinor: 1_000_000, balanceNowMinor: 4_500_000 }, "2026-10-28");
    expect(bill).toEqual({
      lastStatement: "2026-10-15",
      nextStatement: "2026-11-15",
      dueDate: "2026-11-04",
      statementMinor: 4_210_050,
      leftMinor: 3_210_050,
      minimumMinor: 210_600,
      minimumLeftMinor: 0,
      status: "due",
      utilizationPct: 45,
    });
  });

  it("knows a bill paid, overdue, or with nothing on it", () => {
    expect(cardBill(terms, { statementBalanceMinor: 100_000, paidSinceMinor: 100_000, balanceNowMinor: 0 }, "2026-10-28").status).toBe("paid");
    expect(cardBill(terms, { statementBalanceMinor: 100_000, paidSinceMinor: 0, balanceNowMinor: 100_000 }, "2026-11-05").status).toBe("overdue");
    expect(cardBill(terms, { statementBalanceMinor: 0, paidSinceMinor: 0, balanceNowMinor: 5_000 }, "2026-10-28")).toMatchObject({ status: "nothing_due", minimumMinor: 0 });
    expect(cardBill({ ...terms, creditLimitMinor: null }, { statementBalanceMinor: 0, paidSinceMinor: 0, balanceNowMinor: 0 }, "2026-10-28").utilizationPct).toBeNull();
  });
});
