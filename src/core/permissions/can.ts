import type { MemberRole } from "@/src/core/models/enums";

export const PERMISSIONS = [
  "workspace.read",
  "workspace.manage",
  "members.manage",
  "pool.manage",
  "budget.manage",
  "expense.submit",
  "expense.decide",
  "reimbursement.pay",
  "report.export",
  "fx.manage",
  "audit.view",
  "transaction.manage",
  "members.invite",
  "integrations.manage",
] as const;

export type PermissionAction = (typeof PERMISSIONS)[number];

/**
 * What a member may do: a built-in role, or a custom role's own set of
 * permissions (defined per workspace). An owner can always do everything.
 */
export type Grant = MemberRole | { role: MemberRole; permissions: readonly PermissionAction[] };

/** What a custom role can hold: everything but running the workspace and its members, which stays with owners. */
export const CUSTOM_ROLE_PERMISSIONS = PERMISSIONS.filter((p) => p !== "workspace.manage" && p !== "members.manage");

export const PERMISSION_LABEL: Record<PermissionAction, string> = {
  "workspace.read": "See the workspace",
  "workspace.manage": "Manage the workspace",
  "members.manage": "Manage members",
  "pool.manage": "Manage budget pools",
  "budget.manage": "Manage budgets, categories and accounts",
  "expense.submit": "Add and submit expenses",
  "expense.decide": "Approve or reject expenses",
  "reimbursement.pay": "Pay back reimbursements",
  "report.export": "Export reports",
  "fx.manage": "Set exchange rates",
  "audit.view": "See the audit history",
  "transaction.manage": "Change or delete anyone's transactions",
  "members.invite": "Invite people as members",
  "integrations.manage": "Manage webhooks and the workspace's email address",
};

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
  "reimbursement.pay": 2,
  "fx.manage": 2,
  /** Who did what with the money: approvers and owners, or a custom role given it (an auditor). */
  "audit.view": 2,
  /** Owners, as before; a custom role (a bookkeeper) can be given them. */
  "transaction.manage": 3,
  "members.invite": 3,
  "integrations.manage": 3,
  "workspace.manage": 3,
  "members.manage": 3,
};

/** The built-in role behind a grant. */
export function roleOf(grant: Grant): MemberRole {
  return typeof grant === "string" ? grant : grant.role;
}

export function can(grant: Grant, action: PermissionAction): boolean {
  if (typeof grant === "string") return rank[grant] >= requiredRank[action];
  return grant.role === "owner" || grant.permissions.includes(action);
}

/** A custom role's permissions as kept: only ones a custom role can hold, each once, and always seeing the workspace. */
export function customRolePermissions(list: readonly string[]): PermissionAction[] {
  const allowed = new Set<string>(CUSTOM_ROLE_PERMISSIONS);
  return CUSTOM_ROLE_PERMISSIONS.filter((p) => p === "workspace.read" || (list.includes(p) && allowed.has(p)));
}

export function assertCan(grant: Grant, action: PermissionAction): void {
  if (!can(grant, action)) {
    throw new Error(`Forbidden: ${action}`);
  }
}

export function roleAtLeast(role: MemberRole, min: MemberRole): boolean {
  return rank[role] >= rank[min];
}
