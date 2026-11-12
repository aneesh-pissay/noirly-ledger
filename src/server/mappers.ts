import { clearingOf } from "@/src/core/clearing";
import type { GstSupply, GstTreatment } from "@/src/core/gst";
import { defaultFiscalStart } from "@/src/core/locale-format";
import type { WorkspacePurpose } from "@/src/core/workspace-purpose";
import type { RolloverMode } from "@/src/core/budgets/rollover";
import type { ApprovalStepDecision, ApprovalStepState, ApproverKind } from "@/src/core/approval-rules";
import { NO_DEADLINES, type DeadlineSettings } from "@/src/core/deadlines";
import type { PoolRules } from "@/src/core/pool-rules";
import type { PoolTemplate } from "@/src/core/pool-templates";
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

/** A workspace's deadline settings as kept, or none set. */
export function deadlinesOf(stored: Partial<Record<keyof DeadlineSettings, unknown>> | null | undefined): DeadlineSettings {
  if (!stored) return NO_DEADLINES;
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    submitWithinDays: n(stored.submitWithinDays),
    monthCloseDay: n(stored.monthCloseDay),
    lateSubmission: stored.lateSubmission === "block" ? "block" : "flag",
    remindAfterDays: n(stored.remindAfterDays),
    escalateAfterDays: n(stored.escalateAfterDays),
  };
}

export function mapWorkspace(doc: WorkspaceDocument): Workspace {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    purpose: doc.kind === "personal" ? "personal" : ((doc.purpose ?? "team") as WorkspacePurpose),
    name: doc.name,
    slug: doc.slug,
    ownerUserId: doc.ownerUserId.toString(),
    baseCurrency: doc.baseCurrency,
    fiscalYearStartMonth: doc.fiscalYearStartMonth ?? defaultFiscalStart(doc.baseCurrency),
    approvalDeadlines: deadlinesOf(doc.approvalDeadlines),
    autoFxRates: Boolean(doc.autoFxRates),
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
    defaultGst: doc.defaultGst
      ? {
          ratePct: doc.defaultGst.ratePct ?? 0,
          treatment: (doc.defaultGst.treatment ?? "taxable") as GstTreatment,
          supply: (doc.defaultGst.supply ?? "intra") as GstSupply,
          itcEligible: Boolean(doc.defaultGst.itcEligible),
        }
      : null,
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
    attachmentCount: doc.attachments?.length ?? 0,
    gst: doc.gst
      ? {
          ratePct: doc.gst.ratePct,
          treatment: doc.gst.treatment as GstTreatment,
          supply: doc.gst.supply as GstSupply,
          gstin: doc.gst.gstin ?? null,
          hsn: doc.gst.hsn ?? null,
          itcEligible: Boolean(doc.gst.itcEligible),
          taxableMinor: doc.gst.taxableMinor,
          cgstMinor: doc.gst.cgstMinor,
          sgstMinor: doc.gst.sgstMinor,
          igstMinor: doc.gst.igstMinor,
          taxMinor: doc.gst.taxMinor,
        }
      : null,
    upiRef: doc.upiRef ?? null,
    upiId: doc.upiId ?? null,
    installmentPlanId: doc.installmentPlanId ? doc.installmentPlanId.toString() : null,
    installmentNumber: doc.installmentNumber ?? null,
    tags: doc.tags ?? [],
    merchant: doc.merchant ?? null,
    projectId: doc.projectId ? doc.projectId.toString() : null,
    departmentId: doc.departmentId ? doc.departmentId.toString() : null,
    splits: (doc.splits ?? []).map((line) => ({
      categoryId: line.categoryId ? line.categoryId.toString() : null,
      amountMinor: line.amountMinor,
      note: line.note ?? null,
    })),
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
    rollover: (doc.rollover ?? "none") as RolloverMode,
    rolloverSince: isoDay(doc.rolloverSince),
    renew: Boolean(doc.renew),
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
    rules: poolRulesOf(doc),
    template: (doc.template as PoolTemplate | null | undefined) ?? null,
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
  };
}

/** A pool's own approval rules and member limits as kept. */
export function poolRulesOf(doc: Pick<BudgetPoolDocument, "approverIds" | "autoApproveUpToMinor" | "memberLimitMinor" | "memberLimits" | "memberLimitPeriod">): PoolRules {
  return {
    approverIds: (doc.approverIds ?? []).map(String),
    autoApproveUpToMinor: doc.autoApproveUpToMinor ?? null,
    memberLimitMinor: doc.memberLimitMinor ?? null,
    memberLimits: (doc.memberLimits ?? []).map((l) => ({ userId: String(l.userId), limitMinor: l.limitMinor })),
    memberLimitPeriod: doc.memberLimitPeriod === "pool" ? "pool" : "monthly",
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
    ...approvalChain(doc),
    ruleName: doc.ruleName ?? null,
    lateSubmission: doc.lateSubmission?.deadline ? { deadline: doc.lateSubmission.deadline, daysLate: doc.lateSubmission.daysLate ?? 0 } : null,
    createdAt: iso(doc.createdAt)!,
    updatedAt: iso(doc.updatedAt)!,
  };
}

/**
 * A request's steps as they stand. One from before multi-level approvals
 * has none stored: it reads as one step any approver decides, its review
 * (if any) as that step's decision.
 */
export function approvalChain(doc: ApprovalRequestDocument): { steps: ApprovalStepState[]; currentStep: number } {
  // A first step saved without a start time started when the expense was submitted.
  const submitted = iso(doc.submittedAt) ?? iso(doc.createdAt);
  if (doc.steps?.length) {
    return {
      steps: doc.steps.map((s, i) => ({
        kind: s.kind as ApproverKind,
        userIds: (s.userIds ?? []).map(String),
        decision: (s.decision as ApprovalStepDecision | null) ?? null,
        decidedById: s.decidedById ? String(s.decidedById) : null,
        onBehalfOfId: s.onBehalfOfId ? String(s.onBehalfOfId) : null,
        decidedAt: iso(s.decidedAt),
        note: s.note ?? null,
        startedAt: iso(s.startedAt) ?? (i === 0 ? submitted : null),
        remindedAt: iso(s.remindedAt),
        escalatedAt: iso(s.escalatedAt),
      })),
      currentStep: doc.currentStep ?? 0,
    };
  }
  const decided = doc.status === "approved" || doc.status === "rejected";
  return {
    steps: [{
      kind: "any",
      userIds: [],
      decision: decided ? doc.status as ApprovalStepDecision : null,
      decidedById: decided && doc.reviewedById ? String(doc.reviewedById) : null,
      onBehalfOfId: null,
      decidedAt: decided ? iso(doc.reviewedAt) : null,
      note: decided ? doc.reviewNote ?? null : null,
      startedAt: submitted,
      remindedAt: null,
      escalatedAt: null,
    }],
    currentStep: 0,
  };
}

export function mapFxRate(doc: FxRateDocument): FxRate {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    currency: doc.currency,
    rateToBaseScaled: doc.rateToBaseScaled,
    effectiveFrom: isoDay(doc.effectiveFrom)!,
    source: doc.source === "auto" ? "auto" : "user",
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
