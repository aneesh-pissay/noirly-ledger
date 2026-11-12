import { describe, expect, it } from "vitest";
import {
  chainFor,
  describeConditions,
  describeStep,
  mayDecide,
  ruleMatches,
  startSteps,
  stepApprovers,
  stepNotifyIds,
  type ApprovalRuleSpec,
  type Decider,
  type ExpenseFacts,
} from "./approval-rules";

const rule = (over: Partial<ApprovalRuleSpec>): ApprovalRuleSpec => ({
  id: "r",
  name: "Rule",
  minAmountMinor: null,
  maxAmountMinor: null,
  categoryIds: [],
  budgetPoolIds: [],
  steps: [{ kind: "any", userIds: [] }],
  ...over,
});

const facts = (over: Partial<ExpenseFacts> = {}): ExpenseFacts => ({
  baseAmountMinor: 10_000,
  categoryId: "travel",
  categoryParentId: null,
  budgetPoolId: "ops",
  ...over,
});

const team: Decider[] = [
  { userId: "owner", role: "owner", canDecide: true },
  { userId: "ada", role: "approver", canDecide: true },
  { userId: "ben", role: "approver", canDecide: true },
  { userId: "mel", role: "member", canDecide: false },
];

describe("approval rules", () => {
  it("matches on amount bounds, inclusive", () => {
    const big = rule({ minAmountMinor: 50_000 });
    expect(ruleMatches(big, facts({ baseAmountMinor: 49_999 }))).toBe(false);
    expect(ruleMatches(big, facts({ baseAmountMinor: 50_000 }))).toBe(true);
    expect(ruleMatches(rule({ maxAmountMinor: 100 }), facts({ baseAmountMinor: 100 }))).toBe(true);
    expect(ruleMatches(rule({ maxAmountMinor: 100 }), facts({ baseAmountMinor: 101 }))).toBe(false);
  });

  it("matches a category or its parent, and a pool", () => {
    const travel = rule({ categoryIds: ["travel"] });
    expect(ruleMatches(travel, facts({ categoryId: "flights", categoryParentId: "travel" }))).toBe(true);
    expect(ruleMatches(travel, facts({ categoryId: "food" }))).toBe(false);
    expect(ruleMatches(travel, facts({ categoryId: null }))).toBe(false);
    expect(ruleMatches(rule({ budgetPoolIds: ["events"] }), facts())).toBe(false);
    expect(ruleMatches(rule({ budgetPoolIds: ["ops", "events"] }), facts())).toBe(true);
  });

  it("takes the first matching rule, or one step any approver decides", () => {
    const rules = [
      rule({ id: "huge", name: "Huge", minAmountMinor: 1_000_000, steps: [{ kind: "any", userIds: [] }, { kind: "owners", userIds: [] }] }),
      rule({ id: "travel", name: "Travel", categoryIds: ["travel"], steps: [{ kind: "members", userIds: ["ada", "ada"] }] }),
    ];
    expect(chainFor(rules, facts({ baseAmountMinor: 2_000_000 })).rule?.id).toBe("huge");
    expect(chainFor(rules, facts())).toEqual({ rule: { id: "travel", name: "Travel" }, steps: [{ kind: "members", userIds: ["ada"] }] });
    expect(chainFor(rules, facts({ categoryId: "food" }))).toEqual({ rule: null, steps: [{ kind: "any", userIds: [] }] });
  });

  it("works out who a step lets decide", () => {
    expect(stepApprovers({ kind: "any", userIds: [] }, team)).toEqual(["owner", "ada", "ben"]);
    expect(stepApprovers({ kind: "owners", userIds: [] }, team)).toEqual(["owner"]);
    // Named people decide even without the approver role.
    expect(stepApprovers({ kind: "members", userIds: ["mel"] }, team)).toEqual(["mel"]);
    // Nobody named is left: the owners take it.
    expect(stepApprovers({ kind: "members", userIds: ["gone"] }, team)).toEqual(["owner"]);
  });

  it("keeps people off their own expense and off two steps of one expense", () => {
    const steps = startSteps([{ kind: "any", userIds: [] }, { kind: "any", userIds: [] }]);
    const request = { submittedById: "ada", steps, currentStep: 0 };
    expect(mayDecide("ada", request, team)).toBe(false);
    expect(mayDecide("ben", request, team)).toBe(true);
    expect(mayDecide("mel", request, team)).toBe(false);

    steps[0] = { ...steps[0], decision: "approved", decidedById: "ben", decidedAt: "2026-10-31", note: null };
    const second = { ...request, steps, currentStep: 1 };
    expect(mayDecide("ben", second, team)).toBe(false);
    expect(mayDecide("owner", second, team)).toBe(true);
  });

  it("lets the only one who can decide do it anyway", () => {
    const duo: Decider[] = [{ userId: "owner", role: "owner", canDecide: true }, { userId: "mel", role: "member", canDecide: false }];
    const steps = startSteps([{ kind: "owners", userIds: [] }, { kind: "owners", userIds: [] }]);
    expect(mayDecide("owner", { submittedById: "owner", steps, currentStep: 0 }, duo)).toBe(true);
    steps[0] = { ...steps[0], decision: "approved", decidedById: "owner", decidedAt: "2026-10-31", note: null };
    expect(mayDecide("owner", { submittedById: "mel", steps, currentStep: 1 }, duo)).toBe(true);
  });

  it("tells only who can decide the step, never the submitter", () => {
    const steps = startSteps([{ kind: "any", userIds: [] }]);
    expect(stepNotifyIds({ submittedById: "ada", steps, currentStep: 0 }, team)).toEqual(["owner", "ben"]);
  });

  it("describes steps and conditions", () => {
    const names: Record<string, string> = { ada: "Ada", ben: "Ben" };
    expect(describeStep({ kind: "members", userIds: ["ada", "ben"] }, (id) => names[id])).toBe("Ada or Ben");
    expect(describeStep({ kind: "owners", userIds: [] }, () => undefined)).toBe("An owner");
    const labels = { money: (m: number) => `$${m / 100}`, category: (id: string) => id, pool: (id: string) => id.toUpperCase() };
    expect(describeConditions(rule({ minAmountMinor: 50_000, categoryIds: ["travel"], budgetPoolIds: ["ops"] }), labels)).toBe("Expenses $500 or more, in travel, from OPS");
    expect(describeConditions(rule({}), labels)).toBe("Every expense");
  });
});
