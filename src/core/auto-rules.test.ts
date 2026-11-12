import { describe, expect, it } from "vitest";
import { applyRules, ruleMatches, ruleProblem, type IncomingFacts, type RuleSpec } from "./auto-rules";

const rule = (over: Partial<RuleSpec>): RuleSpec => ({
  id: "r",
  name: "Rule",
  field: "any",
  op: "contains",
  value: "swiggy",
  type: null,
  accountId: null,
  minMinor: null,
  maxMinor: null,
  set: { categoryId: null, merchant: null, tags: [], projectId: null },
  ...over,
});

const facts = (over: Partial<IncomingFacts> = {}): IncomingFacts => ({ type: "expense", note: "UPI/SWIGGY  ORDER 4411", merchant: null, accountId: "bank", amountMinor: 45_000, ...over });
const none = { categoryId: false, merchant: false, projectId: false };

describe("transaction rules", () => {
  it("matches text in the note or merchant, ignoring case and spacing", () => {
    expect(ruleMatches(rule({ value: "Swiggy order" }), facts())).toBe(true);
    expect(ruleMatches(rule({ field: "merchant" }), facts())).toBe(false);
    expect(ruleMatches(rule({ field: "merchant" }), facts({ merchant: "Swiggy" }))).toBe(true);
    expect(ruleMatches(rule({ op: "starts_with", value: "upi/" }), facts())).toBe(true);
    expect(ruleMatches(rule({ op: "equals", value: "upi/swiggy" }), facts())).toBe(false);
  });

  it("narrows by type, account and amount", () => {
    expect(ruleMatches(rule({ type: "income" }), facts())).toBe(false);
    expect(ruleMatches(rule({ accountId: "card" }), facts())).toBe(false);
    expect(ruleMatches(rule({ minMinor: 50_000 }), facts())).toBe(false);
    expect(ruleMatches(rule({ maxMinor: 45_000 }), facts())).toBe(true);
  });

  it("fills each field from the first rule that sets it, tags from all", () => {
    const rules = [
      rule({ id: "a", set: { categoryId: "food", merchant: "Swiggy", tags: ["delivery"], projectId: null } }),
      rule({ id: "b", set: { categoryId: "other", merchant: null, tags: ["delivery", "online"], projectId: "trip" } }),
      rule({ id: "c", value: "nothing here", set: { categoryId: "x", merchant: null, tags: [], projectId: null } }),
    ];
    expect(applyRules(rules, facts(), none)).toEqual({ categoryId: "food", merchant: "Swiggy", projectId: "trip", tags: ["delivery", "online"], ruleIds: ["a", "b"] });
  });

  it("never changes what was chosen, and leaves refunds and transfers alone", () => {
    const rules = [rule({ set: { categoryId: "food", merchant: "Swiggy", tags: [], projectId: null } })];
    expect(applyRules(rules, facts(), { categoryId: true, merchant: true, projectId: false })).toMatchObject({ categoryId: null, merchant: null, ruleIds: [] });
    expect(applyRules(rules, facts({ type: "refund" }), none).ruleIds).toEqual([]);
    expect(applyRules(rules, facts({ type: "transfer" }), none).ruleIds).toEqual([]);
  });

  it("needs text and something to set", () => {
    expect(ruleProblem({ value: "  ", minMinor: null, maxMinor: null, set: { categoryId: "x", merchant: null, tags: [], projectId: null } })).toMatch(/text/);
    expect(ruleProblem({ value: "x", minMinor: null, maxMinor: null, set: { categoryId: null, merchant: null, tags: [], projectId: null } })).toMatch(/something to set/);
    expect(ruleProblem({ value: "x", minMinor: 5, maxMinor: 1, set: { categoryId: "c", merchant: null, tags: [], projectId: null } })).toMatch(/lowest/);
    expect(ruleProblem({ value: "x", minMinor: null, maxMinor: null, set: { categoryId: null, merchant: null, tags: ["ok"], projectId: null } })).toBeNull();
  });
});
