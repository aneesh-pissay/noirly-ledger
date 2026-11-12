import { describe, expect, it } from "vitest";
import { activeDelegations, delegationProblem, delegationState, describeEvent, type ApprovalEventView, type DelegationWindow } from "./delegations";
import { decideAs, startSteps, stepNotifyIds, type Decider } from "./approval-rules";

const window = (over: Partial<DelegationWindow> = {}): DelegationWindow => ({
  fromUserId: "ada",
  toUserId: "mel",
  startsOn: "2026-11-01",
  endsOn: "2026-11-07",
  endedAt: null,
  ...over,
});

const team: Decider[] = [
  { userId: "owner", role: "owner", canDecide: true },
  { userId: "ada", role: "approver", canDecide: true },
  { userId: "ben", role: "approver", canDecide: true },
  { userId: "mel", role: "member", canDecide: false },
  { userId: "sam", role: "member", canDecide: false },
];

describe("delegation windows", () => {
  it("runs from its first day to its last, inclusive, unless ended", () => {
    expect(delegationState(window(), "2026-10-31")).toBe("upcoming");
    expect(delegationState(window(), "2026-11-01")).toBe("active");
    expect(delegationState(window(), "2026-11-07")).toBe("active");
    expect(delegationState(window(), "2026-11-08")).toBe("over");
    expect(delegationState(window({ endedAt: "2026-11-02T10:00:00Z" }), "2026-11-03")).toBe("over");
    expect(activeDelegations([window(), window({ fromUserId: "ben", startsOn: "2026-12-01", endsOn: "2026-12-02" })], "2026-11-03")).toEqual([{ fromUserId: "ada", toUserId: "mel" }]);
  });

  it("refuses yourself, backwards or past days, and overlapping cover", () => {
    const today = "2026-10-31";
    expect(delegationProblem({ fromUserId: "ada", toUserId: "ada", startsOn: today, endsOn: today }, today, [])).toMatch(/other than yourself/);
    expect(delegationProblem({ fromUserId: "ada", toUserId: "mel", startsOn: "2026-11-05", endsOn: "2026-11-01" }, today, [])).toMatch(/before the first/);
    expect(delegationProblem({ fromUserId: "ada", toUserId: "mel", startsOn: "2026-10-01", endsOn: "2026-10-02" }, today, [])).toMatch(/over/);
    expect(delegationProblem({ fromUserId: "ada", toUserId: "ben", startsOn: "2026-11-07", endsOn: "2026-11-09" }, today, [window()])).toMatch(/already/);
    expect(delegationProblem({ fromUserId: "ada", toUserId: "ben", startsOn: "2026-11-08", endsOn: "2026-11-09" }, today, [window()])).toBeNull();
    expect(delegationProblem({ fromUserId: "ada", toUserId: "ben", startsOn: "2026-11-02", endsOn: "2026-11-03" }, today, [window({ endedAt: "x" })])).toBeNull();
  });
});

describe("deciding for someone away", () => {
  const away = [{ fromUserId: "ada", toUserId: "mel" }];

  it("lets the delegate decide what the person away could, on their behalf", () => {
    const request = { submittedById: "sam", steps: startSteps([{ kind: "members", userIds: ["ada"] }]), currentStep: 0 };
    expect(decideAs("mel", request, team, [])).toBeNull();
    expect(decideAs("mel", request, team, away)).toEqual({ onBehalfOfId: "ada" });
    expect(decideAs("ada", request, team, away)).toEqual({ onBehalfOfId: null });
    expect(decideAs("sam", request, team, away)).toBeNull();
  });

  it("never lets a delegate decide their own expense, or the away person's", () => {
    const own = { submittedById: "mel", steps: startSteps([{ kind: "members", userIds: ["ada"] }]), currentStep: 0 };
    expect(decideAs("mel", own, team, away)).toBeNull();
    const ada = { submittedById: "ada", steps: startSteps([{ kind: "any", userIds: [] }]), currentStep: 0 };
    expect(decideAs("mel", ada, team, away)).toBeNull();
  });

  it("counts a step decided for someone as theirs too, for the one-step-each rule", () => {
    const steps = startSteps([{ kind: "any", userIds: [] }, { kind: "any", userIds: [] }]);
    steps[0] = { ...steps[0]!, decision: "approved", decidedById: "mel", onBehalfOfId: "ada", decidedAt: "2026-11-02", note: null };
    const request = { submittedById: "sam", steps, currentStep: 1 };
    expect(decideAs("ada", request, team, away)).toBeNull();
    expect(decideAs("mel", request, team, away)).toBeNull();
    expect(decideAs("ben", request, team, away)).toEqual({ onBehalfOfId: null });
  });

  it("tells the delegate when the person away is asked", () => {
    const request = { submittedById: "sam", steps: startSteps([{ kind: "members", userIds: ["ada"] }]), currentStep: 0 };
    expect(stepNotifyIds(request, team, away)).toEqual(["ada", "mel"]);
  });
});

describe("history entries", () => {
  const base: ApprovalEventView = { id: "1", kind: "approved", approvalId: "a", actorId: "mel", actorName: "Mel", otherUserId: "ada", otherName: "Ada", step: 0, stepCount: 2, note: null, summary: "Taxi", at: "2026-11-02" };
  it("reads as a sentence", () => {
    expect(describeEvent(base)).toBe("Mel approved Taxi (step 1 of 2), for Ada");
    expect(describeEvent({ ...base, kind: "submitted", otherName: null, step: null })).toBe("Mel submitted Taxi");
    expect(describeEvent({ ...base, kind: "delegation.started", approvalId: null, actorName: "Ada", otherName: "Mel", note: "Leave" })).toBe("Ada asked Mel to approve for them (Leave)");
  });
});
