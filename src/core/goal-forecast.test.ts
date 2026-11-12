import { describe, expect, it } from "vitest";
import { forecastGoal, milestones, milestonesCrossed, monthlyPace } from "@/src/core/goal-forecast";

const today = "2026-10-28";

describe("goal milestones and forecasts", () => {
  it("knows which milestones a contribution crossed", () => {
    expect(milestonesCrossed(100_000, 20_000, 55_000)).toEqual([25, 50]);
    expect(milestonesCrossed(100_000, 55_000, 60_000)).toEqual([]);
    expect(milestonesCrossed(100_000, 90_000, 120_000)).toEqual([100]);
  });

  it("dates each milestone from the contributions, counting money from before the log as reached", () => {
    expect(milestones(100_000, 60_000, [{ date: "2026-09-01", amountMinor: 20_000 }, { date: "2026-10-01", amountMinor: 10_000 }])).toEqual([
      { percent: 25, amountMinor: 25_000, reached: true, reachedOn: null },
      { percent: 50, amountMinor: 50_000, reached: true, reachedOn: "2026-09-01" },
      { percent: 75, amountMinor: 75_000, reached: false, reachedOn: null },
      { percent: 100, amountMinor: 100_000, reached: false, reachedOn: null },
    ]);
    // Taken out again: a milestone once passed isn't reached any more.
    expect(milestones(100_000, 40_000, [{ date: "2026-09-01", amountMinor: 60_000 }, { date: "2026-10-01", amountMinor: -20_000 }])[1]).toMatchObject({ reached: false, reachedOn: null });
  });

  it("measures the pace over the last three months, or since the first contribution", () => {
    expect(monthlyPace([{ date: "2026-08-01", amountMinor: 30_000 }, { date: "2026-09-01", amountMinor: 30_000 }, { date: "2026-10-01", amountMinor: 30_000 }], today)).toBe(31_132);
    // One contribution yesterday counts as a month's worth, not a day's.
    expect(monthlyPace([{ date: "2026-10-27", amountMinor: 10_000 }], today)).toBe(10_000);
    expect(monthlyPace([{ date: "2026-01-01", amountMinor: 10_000 }], today)).toBe(0);
  });

  it("forecasts when it'll be reached, against the target date", () => {
    const contributions = [{ date: "2026-09-28", amountMinor: 10_000 }];
    const slow = forecastGoal({ targetMinor: 100_000, currentMinor: 40_000, targetDate: "2027-01-28" }, contributions, today);
    expect(slow).toMatchObject({ paceMinor: 10_000, projectedDate: "2027-04-29", neededMonthlyMinor: 19_900, onTrack: false });
    const fast = forecastGoal({ targetMinor: 100_000, currentMinor: 40_000, targetDate: "2027-12-31" }, contributions, today);
    expect(fast.onTrack).toBe(true);
    expect(forecastGoal({ targetMinor: 100_000, currentMinor: 40_000, targetDate: null }, [], today)).toMatchObject({ paceMinor: 0, projectedDate: null, onTrack: null });
    expect(forecastGoal({ targetMinor: 100_000, currentMinor: 100_000, targetDate: "2026-01-01" }, [], today)).toMatchObject({ projectedDate: today, onTrack: true, neededMonthlyMinor: 0 });
  });
});
