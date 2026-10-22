import { clearingOf } from "@/src/core/clearing";
import type {
  ApprovalRequest,
  Budget,
  BudgetPool,
  Category,
  FxRate,
  InAppNotification,
  RecurrenceRule,
  SavingsGoal,
  Transaction,
  Workspace,
} from "@/src/core/sync/types";
import type {
  ApprovalRequestDocument,
  BudgetDocument,
  BudgetPoolDocument,
  CategoryDocument,
  FxRateDocument,
  NotificationDocument,
  SavingsGoalDocument,
  TransactionDocument,
  WorkspaceDocument,
} from "@/src/server/models";
import { receiptUrlFor } from "@/src/server/storage/receipt-keys";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function isoDay(value: Date | string | null | undefined): string | null {
  const full = iso(value);
  return full ? full.slice(0, 10) : null;
}

export function mapWorkspace(doc: WorkspaceDocument): Workspace {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    name: doc.name,
    slug: doc.slug,
    ownerUserId: doc.ownerUserId.toString(),
    baseCurrency: doc.baseCurrency,
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
  };
}

export function mapCategory(doc: CategoryDocument): Category {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    name: doc.name,
    icon: doc.icon,
    color: doc.color,
    isSystem: Boolean(doc.isSystem),
    parentId: doc.parentId ? doc.parentId.toString() : null,
    archivedAt: iso(doc.archivedAt),
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
    deletedAt: iso(doc.deletedAt),
  };
}

export function mapTransaction(doc: TransactionDocument): Transaction {
  const recurrence = doc.recurrence as RecurrenceRule | null | undefined;
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    type: doc.type,
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    baseAmountMinor: doc.baseAmountMinor,
    categoryId: doc.categoryId ? doc.categoryId.toString() : null,
    budgetPoolId: doc.budgetPoolId ? doc.budgetPoolId.toString() : null,
    accountId: doc.accountId ? doc.accountId.toString() : null,
    toAccountId: doc.toAccountId ? doc.toAccountId.toString() : null,
    toAmountMinor: doc.toAmountMinor ?? null,
    refundOfId: doc.refundOfId ? doc.refundOfId.toString() : null,
    // Filled in where it's listed; see withRefunded.
    refundedMinor: 0,
    clearing: clearingOf(doc.clearing),
    date: isoDay(doc.date)!,
    note: doc.note ?? null,
    // Built from the key, not the stored URL: older rows hold public R2 links.
    receiptUrl: doc.receiptStorageKey ? receiptUrlFor(doc.receiptStorageKey) : null,
    receiptStorageKey: doc.receiptStorageKey ?? null,
    isRecurring: Boolean(doc.isRecurring),
    recurrence: recurrence
      ? {
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          until: recurrence.until ?? null,
        }
      : null,
    recurringParentId: doc.recurringParentId
      ? doc.recurringParentId.toString()
      : null,
    createdById: doc.createdById.toString(),
    approvalRequestId: doc.approvalRequestId
      ? doc.approvalRequestId.toString()
      : null,
    isPosted: Boolean(doc.isPosted),
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
    deletedAt: iso(doc.deletedAt),
  };
}

export function mapBudget(doc: BudgetDocument): Budget {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    categoryId: doc.categoryId.toString(),
    period: doc.period,
    periodStart: isoDay(doc.periodStart),
    periodEnd: isoDay(doc.periodEnd),
    limitAmountMinor: doc.limitAmountMinor,
    currency: doc.currency,
    alertThresholdPct: doc.alertThresholdPct,
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
  };
}

export function mapBudgetPool(doc: BudgetPoolDocument): BudgetPool {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    name: doc.name,
    description: doc.description ?? null,
    limitAmountMinor: doc.limitAmountMinor,
    currency: doc.currency,
    currentSpendMinor: doc.currentSpendMinor,
    periodStart: isoDay(doc.periodStart),
    periodEnd: isoDay(doc.periodEnd),
    archivedAt: iso(doc.archivedAt),
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
  };
}

export function mapSavingsGoal(doc: SavingsGoalDocument): SavingsGoal {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    name: doc.name,
    targetAmountMinor: doc.targetAmountMinor,
    currentAmountMinor: doc.currentAmountMinor,
    currency: doc.currency,
    targetDate: isoDay(doc.targetDate),
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
    completedAt: iso(doc.completedAt),
  };
}

export function mapApproval(doc: ApprovalRequestDocument): ApprovalRequest {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    transactionId: doc.transactionId.toString(),
    budgetPoolId: doc.budgetPoolId.toString(),
    submittedById: doc.submittedById.toString(),
    status: doc.status,
    reviewedById: doc.reviewedById ? doc.reviewedById.toString() : null,
    reviewNote: doc.reviewNote ?? null,
    submittedAt: iso(doc.submittedAt),
    reviewedAt: iso(doc.reviewedAt),
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
  };
}

export function mapFxRate(doc: FxRateDocument): FxRate {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    currency: doc.currency,
    rateToBaseScaled: doc.rateToBaseScaled,
    effectiveFrom: isoDay(doc.effectiveFrom)!,
    createdById: doc.createdById.toString(),
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
  };
}

export function mapNotification(doc: NotificationDocument): InAppNotification {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    workspaceId: doc.workspaceId ? doc.workspaceId.toString() : null,
    kind: doc.kind as InAppNotification["kind"],
    title: doc.title,
    body: doc.body,
    href: doc.href ?? null,
    readAt: iso(doc.readAt),
    createdAt: iso(doc.createdAt)!,
  };
}
