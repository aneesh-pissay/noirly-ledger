import { describe, expect, it } from "vitest";
import { coveredRange, describeSchedule, nextRunOn, runAfter, scheduleProblem } from "./export-schedules";

describe("export schedules", () => {
  it("runs on the chosen weekday or day of the month, today included", () => {
    // 31 Oct 2026 is a Saturday.
    expect(nextRunOn({ frequency: "weekly", runDay: 1 }, "2026-10-31")).toBe("2026-11-02");
    expect(nextRunOn({ frequency: "weekly", runDay: 6 }, "2026-10-31")).toBe("2026-10-31");
    expect(nextRunOn({ frequency: "monthly", runDay: 3 }, "2026-10-31")).toBe("2026-11-03");
    expect(nextRunOn({ frequency: "monthly", runDay: 31 - 3 }, "2026-10-28")).toBe("2026-10-28");
    expect(runAfter({ frequency: "weekly", runDay: 1 }, "2026-11-02")).toBe("2026-11-09");
    expect(runAfter({ frequency: "monthly", runDay: 3 }, "2026-12-03")).toBe("2027-01-03");
  });

  it("covers the full week or month just finished", () => {
    expect(coveredRange("weekly", "2026-11-02")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(coveredRange("weekly", "2026-11-05")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(coveredRange("monthly", "2026-11-03")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(coveredRange("monthly", "2027-01-03")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("describes and checks schedules", () => {
    expect(describeSchedule({ frequency: "weekly", runDay: 1 })).toBe("Every Monday, for the week before");
    expect(describeSchedule({ frequency: "monthly", runDay: 2 })).toBe("On the 2nd of every month, for the month before");
    expect(describeSchedule({ frequency: "monthly", runDay: 11 })).toContain("11th");
    expect(scheduleProblem({ frequency: "weekly", runDay: 8 })).toMatch(/week/);
    expect(scheduleProblem({ frequency: "monthly", runDay: 29 })).toMatch(/1 to 28/);
    expect(scheduleProblem({ frequency: "monthly", runDay: 28 })).toBeNull();
  });
});
