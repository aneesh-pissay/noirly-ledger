import { describe, expect, it } from "vitest";
import { cashFlowReport, incomeVsExpense, reportCsv, savingsRate } from "./cash-flow-report";
import { periodIndex, periods, periodStart, suggestedGranularity } from "./periods";

describe("report periods", () => {
  it("cuts a range into clipped months, Monday weeks, and fiscal quarters and years", () => {
    expect(periods("2026-01-15", "2026-03-10", "month").map((p) => [p.label, p.from, p.to])).toEqual([
      ["Jan 2026", "2026-01-15", "2026-01-31"],
      ["Feb 2026", "2026-02-01", "2026-02-28"],
      ["Mar 2026", "2026-03-01", "2026-03-10"],
    ]);
    expect(periodStart("2026-10-31", "week")).toBe("2026-10-26");
    expect(periods("2026-10-29", "2026-11-03", "week").map((p) => [p.from, p.to])).toEqual([["2026-10-29", "2026-11-01"], ["2026-11-02", "2026-11-03"]]);
    expect(periods("2026-04-01", "2027-03-31", "quarter", 4).map((p) => p.label)).toEqual(["Q1 FY 2026–27", "Q2 FY 2026–27", "Q3 FY 2026–27", "Q4 FY 2026–27"]);
    expect(periods("2026-02-01", "2026-05-01", "year", 4).map((p) => [p.label, p.from, p.to])).toEqual([["FY 2025–26", "2026-02-01", "2026-03-31"], ["FY 2026–27", "2026-04-01", "2026-05-01"]]);
    expect(periods("2026-02-01", "2026-01-01", "month")).toEqual([]);
  });

  it("finds a day's period, and suggests a readable granularity", () => {
    const list = periods("2026-01-01", "2026-12-31", "month");
    expect(periodIndex(list, "2026-07-04")).toBe(6);
    expect(periodIndex(list, "2027-01-01")).toBe(-1);
    expect(suggestedGranularity("2026-10-01", "2026-10-31")).toBe("week");
    expect(suggestedGranularity("2026-01-01", "2026-12-31")).toBe("month");
    expect(suggestedGranularity("2020-01-01", "2026-12-31")).toBe("year");
  });
});

describe("income versus expense", () => {
  it("nets refunds off spending, per period and in total", () => {
    const list = periods("2026-01-01", "2026-03-31", "month");
    const report = incomeVsExpense(
      [
        { date: "2026-01-05", type: "income", amountMinor: 100_000 },
        { date: "2026-01-10", type: "expense", amountMinor: 60_000 },
        { date: "2026-01-12", type: "refund", amountMinor: 10_000 },
        { date: "2026-02-03", type: "expense", amountMinor: 20_000 },
        { date: "2025-12-31", type: "income", amountMinor: 999 },
      ],
      list,
    );
    expect(report.rows.map((r) => [r.label, r.incomeMinor, r.expenseMinor, r.netMinor, r.savingsRatePct])).toEqual([
      ["Jan 2026", 100_000, 50_000, 50_000, 50],
      ["Feb 2026", 0, 20_000, -20_000, null],
      ["Mar 2026", 0, 0, 0, null],
    ]);
    expect(report.totals).toEqual({ incomeMinor: 100_000, expenseMinor: 70_000, netMinor: 30_000, savingsRatePct: 30 });
    // Averaged over the two months with money moving.
    expect(report.averages).toEqual({ incomeMinor: 50_000, expenseMinor: 35_000, netMinor: 15_000 });
    expect(savingsRate(0, -5)).toBeNull();
  });
});

describe("cash flow", () => {
  it("adds up: opening + in − out + other = closing, period after period", () => {
    const list = periods("2026-01-01", "2026-02-28", "month");
    const balances: Record<string, number> = { "2025-12-31": 10_000, "2026-01-31": 15_000, "2026-02-28": 30_000 };
    const report = cashFlowReport(
      [
        { date: "2026-01-02", deltaMinor: 20_000 },
        { date: "2026-01-20", deltaMinor: -15_000 },
        { date: "2026-02-10", deltaMinor: -5_000 },
      ],
      list,
      (day) => balances[day]!,
    );
    expect(report.rows.map((r) => [r.openingMinor, r.inMinor, r.outMinor, r.otherMinor, r.closingMinor])).toEqual([
      [10_000, 20_000, 15_000, 0, 15_000],
      // A new account opened with 20,000 shows as "other".
      [15_000, 0, 5_000, 20_000, 30_000],
    ]);
    expect(report.totals).toEqual({ openingMinor: 10_000, inMinor: 20_000, outMinor: 20_000, otherMinor: 20_000, closingMinor: 30_000 });
  });

  it("writes CSV with major units", () => {
    expect(reportCsv([{ key: "label", label: "Period" }, { key: "netMinor", label: "Net", money: true }], [{ label: "Jan, 2026", netMinor: -1_250 }], "INR")).toBe(
      'Period,Net,currency\n"Jan, 2026",-12.50,INR\n',
    );
  });
});
