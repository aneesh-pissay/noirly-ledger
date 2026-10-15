import type { MemberRole } from "@/src/core/models/enums";

export const PERMISSIONS = [
  "workspace.read",
  "workspace.manage",
  "members.manage",
  "pool.manage",
  "budget.manage",
  "expense.submit",
  "expense.decide",
  "report.export",
  "fx.manage",
] as const;

export type PermissionAction = (typeof PERMISSIONS)[number];

const rank: Record<MemberRole, number> = {
  member: 1,
  approver: 2,
  owner: 3,
};

const requiredRank: Record<PermissionAction, number> = {
  "workspace.read": 1,
  "expense.submit": 1,
  "report.export": 1,
  "pool.manage": 2,
  /** Categories and category budgets shape everyone's reports. */
  "budget.manage": 2,
  "expense.decide": 2,
  "fx.manage": 2,
  "workspace.manage": 3,
  "members.manage": 3,
};

export function can(role: MemberRole, action: PermissionAction): boolean {
  return rank[role] >= requiredRank[action];
}

export function assertCan(role: MemberRole, action: PermissionAction): void {
  if (!can(role, action)) {
    throw new Error(`Forbidden: ${action}`);
  }
}

export function roleAtLeast(role: MemberRole, min: MemberRole): boolean {
  return rank[role] >= rank[min];
}
