import { describe, expect, it } from "vitest";
import { allMatch, conditionMatches, renderTemplate, workflowProblem, type EventFacts } from "./workflows";

const facts = (over: Partial<EventFacts> = {}): EventFacts => ({
  type: "expense",
  amountMinor: 50_000,
  categoryId: "dining",
  categoryParentId: "food",
  merchant: "Cafe  One",
  accountId: "card",
  tags: ["work"],
  poolId: "ops",
  memberId: "mel",
  ...over,
});

describe("workflow conditions", () => {
  it("compare each fact", () => {
    expect(conditionMatches({ field: "type", op: "is", value: "expense" }, facts())).toBe(true);
    expect(conditionMatches({ field: "type", op: "is_not", value: "expense" }, facts())).toBe(false);
    expect(conditionMatches({ field: "amount", op: "gte", value: "50000" }, facts())).toBe(true);
    expect(conditionMatches({ field: "amount", op: "lte", value: "49999" }, facts())).toBe(false);
    expect(conditionMatches({ field: "amount", op: "gte", value: "1" }, facts({ amountMinor: null }))).toBe(false);
    expect(conditionMatches({ field: "merchant", op: "contains", value: "cafe one" }, facts())).toBe(true);
    expect(conditionMatches({ field: "merchant", op: "is", value: "CAFE ONE" }, facts())).toBe(true);
    expect(conditionMatches({ field: "tag", op: "is", value: "#Work" }, facts())).toBe(true);
    expect(conditionMatches({ field: "pool", op: "is_not", value: "ops" }, facts())).toBe(false);
    expect(conditionMatches({ field: "member", op: "is", value: "mel" }, facts())).toBe(true);
  });

  it("covers a category's subcategories, and needs all to hold", () => {
    expect(conditionMatches({ field: "category", op: "is", value: "food" }, facts())).toBe(true);
    expect(conditionMatches({ field: "category", op: "is_not", value: "food" }, facts())).toBe(false);
    expect(allMatch([{ field: "category", op: "is", value: "food" }, { field: "amount", op: "gte", value: "100000" }], facts())).toBe(false);
    expect(allMatch([], facts())).toBe(true);
  });
});

describe("workflow messages and checks", () => {
  it("fills placeholders, leaving unknown ones", () => {
    expect(renderTemplate("{{member}} spent {{ amount }} at {{merchant}} {{nope}}", { member: "Mel", amount: "$5", merchant: "Cafe" })).toBe("Mel spent $5 at Cafe {{nope}}");
  });

  it("refuses workflows that can't run", () => {
    const base = { name: "W", trigger: "transaction.added" as const, conditions: [], actions: [{ type: "notify" as const, audience: "owners" as const, userIds: [], message: "Hi" }] };
    expect(workflowProblem(base)).toBeNull();
    expect(workflowProblem({ ...base, actions: [] })).toMatch(/action/);
    expect(workflowProblem({ ...base, conditions: [{ field: "pool", op: "is", value: "x" }] })).toMatch(/trigger/);
    expect(workflowProblem({ ...base, conditions: [{ field: "amount", op: "is", value: "5" }] })).toMatch(/doesn't work/);
    expect(workflowProblem({ ...base, conditions: [{ field: "amount", op: "gte", value: "5.00" }] })).toMatch(/minor units/);
    expect(workflowProblem({ ...base, trigger: "budget.alert", actions: [{ type: "add_tags", tags: ["x"] }] })).toMatch(/no transaction/);
    expect(workflowProblem({ ...base, actions: [{ type: "email", audience: "people", userIds: [], message: "x" }] })).toMatch(/who/);
    expect(workflowProblem({ ...base, actions: [{ type: "comment", message: " " }] })).toMatch(/message/);
  });
});
