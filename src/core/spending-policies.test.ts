import { describe, expect, it } from "vitest";
import { blocking, describePolicy, policyApplies, policyViolations, type PolicyFacts, type SpendingPolicySpec } from "./spending-policies";

const money = (m: number) => `$${(m / 100).toFixed(2)}`;

const policy = (over: Partial<SpendingPolicySpec>): SpendingPolicySpec => ({
  id: "p",
  name: "Policy",
  categoryIds: [],
  merchants: [],
  budgetPoolIds: [],
  maxAmountMinor: null,
  receiptOverMinor: null,
  disallowed: false,
  enforcement: "flag",
  ...over,
});

const facts = (over: Partial<PolicyFacts> = {}): PolicyFacts => ({
  baseAmountMinor: 5_000,
  categoryId: "meals",
  categoryParentId: null,
  merchantKey: "cafe one",
  budgetPoolId: "ops",
  hasReceipt: false,
  ...over,
});

describe("spending policies", () => {
  it("applies by category (or its parent), merchant and pool; with none named, to everything", () => {
    expect(policyApplies(policy({}), facts())).toBe(true);
    expect(policyApplies(policy({ categoryIds: ["food"] }), facts({ categoryParentId: "food" }))).toBe(true);
    expect(policyApplies(policy({ categoryIds: ["travel"] }), facts())).toBe(false);
    expect(policyApplies(policy({ merchants: ["cafe one"] }), facts())).toBe(true);
    expect(policyApplies(policy({ merchants: ["cafe one"] }), facts({ merchantKey: null }))).toBe(false);
    expect(policyApplies(policy({ budgetPoolIds: ["events"] }), facts())).toBe(false);
  });

  it("flags going over a cap and a missing receipt", () => {
    const meals = policy({ name: "Meals", maxAmountMinor: 4_000, receiptOverMinor: 2_500 });
    expect(policyViolations([meals], facts(), money).map((v) => v.message)).toEqual([
      "Meals: over the $40.00 limit by $10.00",
      "Meals: needs a receipt from $25.00",
    ]);
    expect(policyViolations([meals], facts({ baseAmountMinor: 2_000 }), money)).toEqual([]);
    expect(policyViolations([meals], facts({ baseAmountMinor: 3_000, hasReceipt: true }), money)).toEqual([]);
    expect(policyViolations([policy({ name: "All", receiptOverMinor: 0 })], facts({ baseAmountMinor: 1 }), money)[0]?.message).toBe("All: needs a receipt");
  });

  it("puts blocking ones first, and a disallowed spend is only that", () => {
    const list = policyViolations(
      [policy({ id: "a", name: "Receipts", receiptOverMinor: 0 }), policy({ id: "b", name: "No bars", merchants: ["cafe one"], disallowed: true, maxAmountMinor: 1, enforcement: "block" })],
      facts(),
      money,
    );
    expect(list.map((v) => [v.policyId, v.kind])).toEqual([["b", "not_allowed"], ["a", "missing_receipt"]]);
    expect(blocking(list).map((v) => v.policyId)).toEqual(["b"]);
  });

  it("describes policies", () => {
    expect(describePolicy(policy({ maxAmountMinor: 4_000, receiptOverMinor: 0 }), money)).toBe("up to $40.00 each, receipt always");
    expect(describePolicy(policy({ disallowed: true }), money)).toBe("Not allowed");
  });
});
