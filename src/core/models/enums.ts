export const WORKSPACE_KINDS = ["personal", "team"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const MEMBER_ROLES = ["owner", "approver", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const BUDGET_PERIODS = ["weekly", "monthly", "custom"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

// A refund takes back part or all of one expense (refundOfId).
export const TRANSACTION_TYPES = ["expense", "income", "transfer", "refund"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const APPROVAL_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
