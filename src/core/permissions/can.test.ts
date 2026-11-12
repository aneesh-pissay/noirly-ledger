import { describe, expect, it } from "vitest";
import { can, customRolePermissions, roleOf } from "./can";

describe("permissions", () => {
  it("allows members to submit expenses but not approve", () => {
    expect(can("member", "expense.submit")).toBe(true);
    expect(can("member", "expense.decide")).toBe(false);
  });

  it("allows approvers to decide and manage pools", () => {
    expect(can("approver", "expense.decide")).toBe(true);
    expect(can("approver", "pool.manage")).toBe(true);
    expect(can("approver", "members.manage")).toBe(false);
  });

  it("allows owners full control", () => {
    expect(can("owner", "members.manage")).toBe(true);
    expect(can("owner", "workspace.manage")).toBe(true);
  });

  it("lets a custom role do exactly what it lists, and an owner everything", () => {
    const bookkeeper = { role: "member" as const, permissions: ["workspace.read", "budget.manage", "report.export"] as const };
    expect(can(bookkeeper, "budget.manage")).toBe(true);
    expect(can(bookkeeper, "expense.submit")).toBe(false);
    expect(can({ role: "owner", permissions: [] }, "members.manage")).toBe(true);
    expect(roleOf(bookkeeper)).toBe("member");
    expect(roleOf("approver")).toBe("approver");
  });

  it("leaves the finer permissions with owners unless a custom role is given them", () => {
    for (const action of ["transaction.manage", "members.invite", "integrations.manage"] as const) {
      expect(can("approver", action)).toBe(false);
      expect(can("owner", action)).toBe(true);
      expect(can({ role: "member", permissions: [action] }, action)).toBe(true);
    }
    expect(can("approver", "audit.view")).toBe(true);
    expect(can("member", "audit.view")).toBe(false);
    expect(customRolePermissions(["members.invite", "transaction.manage", "integrations.manage", "audit.view"])).toEqual(["workspace.read", "audit.view", "transaction.manage", "members.invite", "integrations.manage"]);
  });

  it("keeps running the workspace and its members out of custom roles", () => {
    expect(customRolePermissions(["members.manage", "expense.decide", "expense.decide", "nonsense"])).toEqual(["workspace.read", "expense.decide"]);
  });
});
