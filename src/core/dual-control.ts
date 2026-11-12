import type { MemberRole } from "@/src/core/models/enums";

/**
 * Two-person approval: a shared workspace can ask that its most sensitive
 * changes take two owners. One asks, the change waits, and another owner
 * agrees (it's then made as the one who asked) or turns it down. With no
 * other owner to ask, the change is made at once; there's nobody to wait for.
 */
export const DUAL_KINDS = [
  "workspace.delete",
  "dual_control.off",
  "member.role",
  "member.remove",
  "approval_rule.create",
  "approval_rule.update",
  "approval_rule.delete",
  "approval_rule.reorder",
] as const;
export type DualKind = (typeof DUAL_KINDS)[number];

export const DUAL_LABEL: Record<DualKind, string> = {
  "workspace.delete": "Delete the workspace",
  "dual_control.off": "Stop asking for a second owner",
  "member.role": "Change who approves",
  "member.remove": "Remove an owner or approver",
  "approval_rule.create": "Add an approval rule",
  "approval_rule.update": "Change an approval rule",
  "approval_rule.delete": "Delete an approval rule",
  "approval_rule.reorder": "Reorder approval rules",
};

/** How long a request waits for the second owner. */
export const PENDING_HOURS = 72;

const DECIDES: readonly MemberRole[] = ["owner", "approver"];

/**
 * A role change is sensitive when it gives or takes away deciding (owner
 * or approver), or changes a custom role (which can carry approving).
 */
export function isSensitiveRoleChange(change: { from: MemberRole; to: MemberRole; fromCustomRoleId: string | null; toCustomRoleId: string | null | undefined }) {
  const roleChanges = change.from !== change.to && (DECIDES.includes(change.from) || DECIDES.includes(change.to));
  const customChanges = change.toCustomRoleId !== undefined && (change.toCustomRoleId ?? null) !== change.fromCustomRoleId;
  return roleChanges || customChanges;
}

export function isSensitiveRemoval(role: MemberRole) {
  return DECIDES.includes(role);
}

export type PendingStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired" | "failed";

/** A request's state now: one still waiting past its time has expired. */
export function pendingState(status: PendingStatus, expiresAt: Date, now: Date): PendingStatus {
  return status === "pending" && expiresAt.getTime() <= now.getTime() ? "expired" : status;
}

export type PendingActionView = {
  id: string;
  kind: DualKind;
  label: string;
  summary: string;
  status: PendingStatus;
  requestedById: string;
  requestedByName: string;
  decidedByName: string | null;
  createdAt: string;
  expiresAt: string;
  result: string | null;
  /** Whether the viewer may approve or turn it down (an owner who didn't ask). */
  canDecide: boolean;
  canCancel: boolean;
};
