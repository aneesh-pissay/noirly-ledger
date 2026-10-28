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

  it("keeps running the workspace and its members out of custom roles", () => {
    expect(customRolePermissions(["members.manage", "expense.decide", "expense.decide", "nonsense"])).toEqual(["workspace.read", "expense.decide"]);
  });
});
