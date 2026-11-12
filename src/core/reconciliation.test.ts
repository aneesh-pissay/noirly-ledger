import { describe, expect, it } from "vitest";
import { daysBetween, reconReportCsv, reconStatus, stalePendingBefore, type ReconReport } from "./reconciliation";

const base = { reconciledThrough: "2026-10-01", reconciledBalanceMinor: 50_000, reconciledNowMinor: 50_000, lateCount: 0 };

describe("reconciliation reports", () => {
  it("says where an account stands", () => {
    expect(reconStatus({ ...base, reconciledThrough: null, reconciledBalanceMinor: null }, "2026-10-31")).toEqual({ status: "never", daysSince: null, driftMinor: null });
    expect(reconStatus(base, "2026-10-31")).toEqual({ status: "ok", daysSince: 30, driftMinor: 0 });
    expect(reconStatus(base, "2026-11-20").status).toBe("due");
    // A reconciled expense of 120.00 deleted since.
    expect(reconStatus({ ...base, reconciledNowMinor: 62_000 }, "2026-11-20")).toEqual({ status: "drift", daysSince: 50, driftMinor: 12_000 });
    // Something added afterwards, dated inside the reconciled period.
    expect(reconStatus({ ...base, lateCount: 1 }, "2026-10-31").status).toBe("drift");
  });

  it("counts days", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(stalePendingBefore("2026-10-31")).toBe("2026-10-17");
  });

  it("writes the report as CSV", () => {
    const report: ReconReport = {
      asOf: "2026-10-31",
      accounts: [{ accountId: "a", name: "HDFC, savings", kind: "bank", currency: "INR", archived: false, status: "drift", reconciledThrough: "2026-10-01", reconciledBalanceMinor: 50_000, reconciledNowMinor: 62_000, driftMinor: 12_000, daysSince: 30, lateCount: 0, unreconciledCount: 3, pendingCount: 1, stalePendingCount: 1, oldestPending: "2026-10-02" }],
      history: [{ id: "r", accountId: "a", accountName: "HDFC, savings", currency: "INR", through: "2026-10-01", statementMinor: 50_000, transactionCount: 7, by: "Asha", at: "2026-10-02T09:00:00.000Z" }],
    };
    const lines = reconReportCsv(report, (m) => (m / 100).toFixed(2)).split("\n");
    expect(lines[1]).toBe('"HDFC, savings",INR,Doesn\'t add up,2026-10-01,500.00,620.00,120.00,0,3,1,1,2026-10-02');
    expect(lines[4]).toBe('2026-10-02,"HDFC, savings",INR,2026-10-01,500.00,7,Asha');
  });
});
