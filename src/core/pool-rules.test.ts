import { describe, expect, it } from "vitest";
import { autoApproves, memberLimitCheck, memberLimitFor, memberLimitWindow, NO_POOL_RULES, resolvePoolSteps, type PoolRules } from "./pool-rules";
import { describeStep, stepApprovers } from "./approval-rules";

const rules = (over: Partial<PoolRules>): PoolRules => ({ ...NO_POOL_RULES, ...over });

describe("pool rules", () => {
  it("gives each member the limit set for them, else the default", () => {
    const r = rules({ memberLimitMinor: 10_000, memberLimits: [{ userId: "mel", limitMinor: 25_000 }] });
    expect(memberLimitFor(r, "mel")).toBe(25_000);
    expect(memberLimitFor(r, "ben")).toBe(10_000);
    expect(memberLimitFor(NO_POOL_RULES, "ben")).toBeNull();
  });

  it("runs a limit per month or over the pool's life", () => {
    expect(memberLimitWindow("monthly", "2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(memberLimitWindow("pool", "2026-02-14")).toBeNull();
  });

  it("says how far an expense would go over", () => {
    expect(memberLimitCheck(null, 0, 100)).toBeNull();
    expect(memberLimitCheck(10_000, 8_000, 2_000)).toMatchObject({ remainingMinor: 2_000, over: false, overByMinor: 0 });
    expect(memberLimitCheck(10_000, 8_000, 2_500)).toMatchObject({ over: true, overByMinor: 500 });
  });

  it("approves small expenses on their own, only with no rule and no flags", () => {
    const r = rules({ autoApproveUpToMinor: 2_000 });
    expect(autoApproves(r, { baseAmountMinor: 2_000, ruleMatched: false, flagged: false })).toBe(true);
    expect(autoApproves(r, { baseAmountMinor: 2_001, ruleMatched: false, flagged: false })).toBe(false);
    expect(autoApproves(r, { baseAmountMinor: 100, ruleMatched: true, flagged: false })).toBe(false);
    expect(autoApproves(r, { baseAmountMinor: 100, ruleMatched: false, flagged: true })).toBe(false);
    expect(autoApproves(NO_POOL_RULES, { baseAmountMinor: 1, ruleMatched: false, flagged: false })).toBe(false);
  });

  it("sends expenses no rule covers to the pool's approvers, and fills in a rule's pool step", () => {
    expect(resolvePoolSteps([{ kind: "any", userIds: [] }], false, ["ada"])).toEqual([{ kind: "members", userIds: ["ada"] }]);
    expect(resolvePoolSteps([{ kind: "any", userIds: [] }], false, [])).toEqual([{ kind: "any", userIds: [] }]);
    expect(resolvePoolSteps([{ kind: "pool", userIds: [] }, { kind: "owners", userIds: [] }], true, ["ada", "ben"])).toEqual([
      { kind: "members", userIds: ["ada", "ben"] },
      { kind: "owners", userIds: [] },
    ]);
    expect(describeStep({ kind: "pool", userIds: [] }, () => undefined)).toBe("The pool's approvers");
    // An unfilled pool step (never stored) falls back to any approver.
    expect(stepApprovers({ kind: "pool", userIds: [] }, [{ userId: "a", role: "approver", canDecide: true }])).toEqual(["a"]);
  });
});
