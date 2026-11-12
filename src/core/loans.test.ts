import { describe, expect, it } from "vitest";
import { checkLoan, loanSchedule, loanStatus } from "@/src/core/loans";

describe("loan repayment schedules", () => {
  // ₹20 lakh over 20 years at 8.5%: the familiar home-loan EMI of ₹17,356.47.
  const rows = loanSchedule({ principalMinor: 200_000_000, months: 240, annualRatePct: 8.5, firstDate: "2026-01-05" });

  it("splits each EMI into interest and principal on a reducing balance", () => {
    expect(rows).toHaveLength(240);
    expect(rows[0]).toMatchObject({ number: 1, date: "2026-01-05", interestMinor: 1_416_667, principalMinor: 318_980, amountMinor: 1_735_647, taxMinor: 0 });
    expect(rows.at(-1)).toMatchObject({ number: 240, date: "2045-12-05", balanceMinor: 0 });
    expect(rows.reduce((s, r) => s + r.principalMinor, 0)).toBe(200_000_000);
  });

  it("knows what's paid, overdue and left", () => {
    const { rows: marked, summary } = loanStatus(rows, 9, "2026-11-01");
    expect(marked.slice(8, 11).map((r) => [r.number, r.status])).toEqual([[9, "paid"], [10, "overdue"], [11, "upcoming"]]);
    expect(summary).toMatchObject({ emiMinor: 1_735_647, paidCount: 9, monthsLeft: 231, nextDate: "2026-10-05", endDate: "2045-12-05", overdueCount: 1 });
    expect(summary.principalPaidMinor + summary.principalLeftMinor).toBe(200_000_000);
    expect(summary.interestPaidMinor + summary.interestLeftMinor).toBe(summary.interestTotalMinor);
  });

  it("checks the terms", () => {
    expect(checkLoan({ principalMinor: 100, months: 12, annualRatePct: 10 })).toEqual({ ok: true });
    expect(checkLoan({ principalMinor: 0, months: 12, annualRatePct: 10 }).ok).toBe(false);
    expect(checkLoan({ principalMinor: 100, months: 481, annualRatePct: 10 }).ok).toBe(false);
    expect(checkLoan({ principalMinor: 100, months: 12, annualRatePct: 61 }).ok).toBe(false);
  });
});
