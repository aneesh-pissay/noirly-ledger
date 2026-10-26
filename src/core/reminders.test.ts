import { describe, expect, it } from "vitest";
import { datedReminders, isRenewal, reminderKey, remindersFor, reminderText } from "@/src/core/reminders";

const today = "2026-10-26";
const off = { daysBefore: null, trialEndsOn: null, cancelBy: null };

describe("bill reminders", () => {
  it("reminds during the days before a charge, not on it or after", () => {
    const monthly = (date: string, daysBefore: number | null = 2) => remindersFor({ date, frequency: "monthly" }, { ...off, daysBefore }, today);
    expect(monthly("2026-10-28")).toEqual([{ kind: "due", on: "2026-10-28", stage: "ahead" }]);
    expect(monthly("2026-10-27")).toEqual([{ kind: "due", on: "2026-10-27", stage: "ahead" }]);
    expect(monthly("2026-10-29")).toEqual([]);
    expect(monthly("2026-10-26")).toEqual([]);
    expect(monthly("2026-10-28", null)).toEqual([]);
    expect(monthly("2026-10-26", 0)).toEqual([{ kind: "due", on: "2026-10-26", stage: "today" }]);
  });

  it("gives EMIs and one-offs the default notice", () => {
    expect(remindersFor({ date: "2026-10-28", frequency: null }, null, today)).toHaveLength(1);
    expect(remindersFor({ date: "2026-10-29", frequency: null }, null, today)).toEqual([]);
  });

  it("gives a week's notice of a renewal", () => {
    expect(isRenewal("yearly")).toBe(true);
    expect(isRenewal("monthly", 3)).toBe(true);
    expect(isRenewal("monthly", 1)).toBe(false);
    expect(remindersFor({ date: "2026-11-02", frequency: "yearly" }, { ...off, daysBefore: 2 }, today)).toEqual([{ kind: "renewal", on: "2026-11-02", stage: "ahead" }]);
    expect(remindersFor({ date: "2026-11-03", frequency: "yearly" }, { ...off, daysBefore: 2 }, today)).toEqual([]);
  });

  it("warns before a trial ends and a cancel-by date, and again on the day", () => {
    expect(datedReminders({ ...off, trialEndsOn: "2026-10-29" }, today)).toEqual([{ kind: "trial", on: "2026-10-29", stage: "ahead" }]);
    expect(datedReminders({ ...off, trialEndsOn: "2026-10-26", cancelBy: "2026-10-28" }, today)).toEqual([
      { kind: "trial", on: "2026-10-26", stage: "today" },
      { kind: "cancel", on: "2026-10-28", stage: "ahead" },
    ]);
    expect(datedReminders({ ...off, trialEndsOn: "2026-10-30", cancelBy: "2026-10-25" }, today)).toEqual([]);
  });

  it("goes once per stage, in plain words", () => {
    expect(reminderKey("r1", { kind: "due", on: "2026-10-28", stage: "ahead" })).toBe("due:r1:2026-10-28:ahead");
    expect(reminderText({ kind: "due", on: "2026-10-28", stage: "ahead" }, "Netflix", "649.00 INR", today)).toEqual({
      title: "Netflix is due in 2 days",
      body: "649.00 INR is due in 2 days, on 2026-10-28.",
    });
    expect(reminderText({ kind: "trial", on: "2026-10-26", stage: "today" }, "Spotify", "119.00 INR", today).title).toBe("Spotify's free trial ends today");
    expect(reminderText({ kind: "cancel", on: "2026-10-27", stage: "ahead" }, "Gym", "2,000.00 INR", today).title).toBe("Cancel Gym by 2026-10-27");
  });
});
