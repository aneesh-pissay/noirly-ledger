import { describe, expect, it } from "vitest";
import { afterSpending, fundProgress, monthsLeft, nextFundDue } from "@/src/core/sinking-funds";

describe("sinking funds", () => {
  it("counts the months left to set aside in", () => {
    expect(monthsLeft("2026-10-26", "2027-03-15")).toBe(5);
    expect(monthsLeft("2026-10-26", "2026-11-01")).toBe(1);
    expect(monthsLeft("2026-10-26", "2026-10-26")).toBe(0);
  });

  it("works out the monthly amount and whether it's keeping up", () => {
    // ₹24,000 car insurance due in five months, started two months ago.
    const fund = { targetMinor: 2_400_000, savedMinor: 600_000, startDate: "2026-08-26", dueDate: "2027-03-15" };
    expect(fundProgress(fund, "2026-10-26")).toEqual({ status: "behind", monthsLeft: 5, monthlyMinor: 360_000, expectedMinor: 728_358 });
    expect(fundProgress({ ...fund, savedMinor: 800_000 }, "2026-10-26").status).toBe("on_track");
    expect(fundProgress({ ...fund, savedMinor: 2_400_000 }, "2026-10-26")).toMatchObject({ status: "ready", monthlyMinor: 0 });
    expect(fundProgress(fund, "2027-03-20")).toMatchObject({ status: "overdue", monthsLeft: 0, monthlyMinor: 1_800_000 });
  });

  it("starts a repeating fund over for the next due date, keeping any extra", () => {
    expect(nextFundDue("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(nextFundDue("2026-11-01", "yearly")).toBe("2027-11-01");
    expect(nextFundDue("2026-11-01", "none")).toBeNull();
    expect(afterSpending(110_000, 99_900)).toBe(10_100);
    expect(afterSpending(50_000, 99_900)).toBe(0);
  });
});
