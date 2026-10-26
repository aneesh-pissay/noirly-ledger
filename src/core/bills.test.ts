import { describe, expect, it } from "vitest";
import { billStatus, billTotals, calendarWeeks, monthBounds, shiftMonth, type BillItem } from "@/src/core/bills";

describe("bill calendar", () => {
  it("knows a month's first and last day, and the months around it", () => {
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("lays a month out in weeks, Monday first or Sunday first", () => {
    // October 2026 starts on a Thursday.
    const monday = calendarWeeks("2026-10");
    expect(monday[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(monday).toHaveLength(5);
    expect(monday.at(-1)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
    expect(calendarWeeks("2026-10", 0)[0]).toEqual([null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("calls a bill paid, due or upcoming", () => {
    expect(billStatus("2026-10-05", "2026-10-26", true)).toBe("paid");
    expect(billStatus("2026-10-26", "2026-10-26", false)).toBe("due");
    expect(billStatus("2026-10-30", "2026-10-26", true)).toBe("upcoming");
  });

  it("adds up what's paid and still to pay, per currency", () => {
    const item = (status: BillItem["status"], amountMinor: number, currency = "INR") => ({ status, amountMinor, currency }) as BillItem;
    expect(billTotals([item("paid", 100), item("due", 50), item("upcoming", 25), item("upcoming", 10, "USD")])).toEqual([
      { currency: "INR", paidMinor: 100, toPayMinor: 75 },
      { currency: "USD", paidMinor: 0, toPayMinor: 10 },
    ]);
  });
});
