import { describe, expect, it } from "vitest";
import { checkPlan, emiAmount, installmentDate, installmentSchedule, scheduleSummary } from "@/src/core/installments";

describe("installmentDate", () => {
  it("keeps the day each month, or the month's last day", () => {
    expect(installmentDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(installmentDate("2026-01-31", 2)).toBe("2026-03-31");
    expect(installmentDate("2026-11-05", 3)).toBe("2027-02-05");
  });
});

describe("installmentSchedule", () => {
  it("splits a no-cost EMI evenly, the last month taking up rounding", () => {
    const rows = installmentSchedule({ principalMinor: 1_000_000, months: 3, annualRatePct: 0, taxOnInterestPct: 18, firstDate: "2026-11-05" });
    expect(rows.map((r) => r.amountMinor)).toEqual([333_333, 333_333, 333_334]);
    expect(rows.every((r) => r.interestMinor === 0 && r.taxMinor === 0)).toBe(true);
    expect(rows.at(-1)!.balanceMinor).toBe(0);
  });

  it("charges interest on a reducing balance, with tax on the interest", () => {
    // 1,00,000 at 12% a year over 12 months: EMI ≈ 8,884.88.
    expect(Math.round(emiAmount(10_000_000, 12, 12))).toBe(888_488);
    const rows = installmentSchedule({ principalMinor: 10_000_000, months: 12, annualRatePct: 12, taxOnInterestPct: 18, firstDate: "2026-11-05" });
    expect(rows[0]).toMatchObject({ interestMinor: 100_000, taxMinor: 18_000, principalMinor: 788_488 });
    expect(rows.reduce((sum, r) => sum + r.principalMinor, 0)).toBe(10_000_000);
    const summary = scheduleSummary(rows, 99_900);
    // Theory says 6,618.55 of interest; rounding each month's interest to the paisa lands within a few paise of it.
    expect(Math.abs(summary.interestMinor - 661_855)).toBeLessThanOrEqual(5);
    expect(summary.taxMinor).toBe(rows.reduce((sum, r) => sum + r.taxMinor, 0));
    expect(summary.totalMinor).toBe(10_000_000 + summary.interestMinor + summary.taxMinor + 99_900);
    expect(summary.costMinor).toBe(summary.interestMinor + summary.taxMinor + 99_900);
  });
});

describe("checkPlan", () => {
  it("needs a price, 2 to 120 months, and sensible rates", () => {
    expect(checkPlan({ principalMinor: 100, months: 6, annualRatePct: 14, taxOnInterestPct: 18 })).toEqual({ ok: true });
    expect(checkPlan({ principalMinor: 0, months: 6, annualRatePct: 0, taxOnInterestPct: 0 }).ok).toBe(false);
    expect(checkPlan({ principalMinor: 100, months: 1, annualRatePct: 0, taxOnInterestPct: 0 }).ok).toBe(false);
    expect(checkPlan({ principalMinor: 100, months: 6, annualRatePct: 90, taxOnInterestPct: 0 }).ok).toBe(false);
  });
});
