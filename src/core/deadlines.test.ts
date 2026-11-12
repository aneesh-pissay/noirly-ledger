import { describe, expect, it } from "vitest";
import { deadlineProblem, escalationAction, isLate, NO_DEADLINES, submissionDeadline, submissionLateness, waitingDays, type DeadlineSettings } from "./deadlines";
import { mayDecide, startSteps, stepApprovers, type Decider } from "./approval-rules";

const s = (over: Partial<DeadlineSettings>): DeadlineSettings => ({ ...NO_DEADLINES, ...over });

describe("submission deadlines", () => {
  it("takes the earlier of days-after-spend and the month's close", () => {
    expect(submissionDeadline("2026-10-20", NO_DEADLINES)).toBeNull();
    expect(submissionDeadline("2026-10-20", s({ submitWithinDays: 30 }))).toBe("2026-11-19");
    expect(submissionDeadline("2026-10-20", s({ monthCloseDay: 5 }))).toBe("2026-11-05");
    expect(submissionDeadline("2026-10-20", s({ submitWithinDays: 10, monthCloseDay: 5 }))).toBe("2026-10-30");
    expect(submissionDeadline("2026-12-31", s({ monthCloseDay: 3 }))).toBe("2027-01-03");
  });

  it("says how late a submission is", () => {
    expect(submissionLateness("2026-10-01", "2026-10-31", s({ submitWithinDays: 30 }))).toBeNull();
    expect(submissionLateness("2026-10-01", "2026-11-03", s({ submitWithinDays: 30 }))).toEqual({ deadline: "2026-10-31", daysLate: 3 });
  });
});

describe("late approvals", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const settings = s({ remindAfterDays: 2, escalateAfterDays: 5 });

  it("reminds, then escalates, each once", () => {
    expect(waitingDays("2026-10-30T13:00:00Z", now)).toBe(0);
    expect(escalationAction({ since: "2026-10-30T12:00:00Z", remindedAt: null, escalatedAt: null }, now, settings)).toBeNull();
    expect(escalationAction({ since: "2026-10-29T12:00:00Z", remindedAt: null, escalatedAt: null }, now, settings)).toBe("remind");
    expect(escalationAction({ since: "2026-10-29T12:00:00Z", remindedAt: "x", escalatedAt: null }, now, settings)).toBeNull();
    expect(escalationAction({ since: "2026-10-26T12:00:00Z", remindedAt: "x", escalatedAt: null }, now, settings)).toBe("escalate");
    // Straight to escalation when the reminder never went (both lines passed).
    expect(escalationAction({ since: "2026-10-20T12:00:00Z", remindedAt: null, escalatedAt: null }, now, settings)).toBe("escalate");
    expect(escalationAction({ since: "2026-10-20T12:00:00Z", remindedAt: "x", escalatedAt: "y" }, now, settings)).toBeNull();
    expect(isLate("2026-10-29T12:00:00Z", now, settings)).toBe(true);
    expect(isLate("2026-10-29T12:00:00Z", now, NO_DEADLINES)).toBe(false);
  });

  it("lets owners decide an escalated step", () => {
    const team: Decider[] = [
      { userId: "owner", role: "owner", canDecide: true },
      { userId: "ada", role: "approver", canDecide: true },
      { userId: "mel", role: "member", canDecide: false },
    ];
    const steps = startSteps([{ kind: "members", userIds: ["ada"] }]);
    expect(stepApprovers(steps[0]!, team)).toEqual(["ada"]);
    expect(mayDecide("owner", { submittedById: "mel", steps, currentStep: 0 }, team)).toBe(false);
    steps[0] = { ...steps[0]!, escalatedAt: "2026-10-31" };
    expect(stepApprovers(steps[0]!, team)).toEqual(["ada", "owner"]);
    expect(mayDecide("owner", { submittedById: "mel", steps, currentStep: 0 }, team)).toBe(true);
  });

  it("checks settings", () => {
    expect(deadlineProblem(s({ monthCloseDay: 31 }))).toMatch(/1 to 28/);
    expect(deadlineProblem(s({ remindAfterDays: 5, escalateAfterDays: 2 }))).toMatch(/no sooner/);
    expect(deadlineProblem(s({ remindAfterDays: 2, escalateAfterDays: 2 }))).toBeNull();
  });
});
