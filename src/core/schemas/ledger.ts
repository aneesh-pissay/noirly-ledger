import { z } from "zod";
import {
  BUDGET_PERIODS,
  RECURRENCE_FREQUENCIES,
  TRANSACTION_TYPES,
} from "@/src/core/models/enums";
import { ACCOUNT_KINDS } from "@/src/core/accounts";
import { CLEARING_STATES } from "@/src/core/clearing";
import { NUMBER_FORMATS } from "@/src/core/locale-format";
import { ROLLOVER_MODES } from "@/src/core/budgets/rollover";
import { WORKSPACE_PURPOSES } from "@/src/core/workspace-purpose";
import { MAX_BULK, MAX_BULK_CREATE } from "@/src/core/bulk";

export const currencyCode = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const amountMajorSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount");

export const recurrenceSchema = z.object({
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  interval: z.number().int().min(1).max(52).default(1),
  until: z.string().nullable().optional(),
});

export const createTransactionBodySchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amountMajor: amountMajorSchema,
  currency: currencyCode,
  categoryId: z.string().min(1).nullable().optional(),
  accountId: z.string().min(1).nullable().optional(),
  /** Transfers: where the money went, and what arrived when that account's currency differs. */
  toAccountId: z.string().min(1).nullable().optional(),
  toAmountMajor: amountMajorSchema.nullable().optional(),
  /** Refunds: the expense this takes back. */
  refundOfId: z.string().min(1).nullable().optional(),
  clearing: z.enum(CLEARING_STATES).optional(),
  /** UPI reference (12 digits, spaces allowed) and UPI ID; checked properly on the server. */
  upiRef: z.string().max(40).nullable().optional(),
  upiId: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).nullable().optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  /** Split across categories; the lines must add up to the amount. null removes a split. */
  splits: z
    .array(
      z.object({
        categoryId: z.string().min(1).nullable(),
        amountMajor: amountMajorSchema,
        note: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .max(20)
    .nullable()
    .optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(2000).nullable().optional(),
  /** Accepted for older clients but ignored: the server builds it from the key. */
  receiptUrl: z.string().max(2048).nullable().optional(),
  receiptStorageKey: z.string().min(1).max(512).nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
});

export const updateTransactionBodySchema = createTransactionBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

/** A balance can be below zero (an overdrawn account, a card in credit). */
export const signedAmountMajorSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Enter a valid amount");

export const createAccountBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(ACCOUNT_KINDS),
  currency: currencyCode,
  openingMajor: signedAmountMajorSchema.default("0"),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  institution: z.string().trim().max(80).nullable().optional(),
});

export const updateAccountBodySchema = createAccountBodySchema
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

const categoryFields = {
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(40),
  color: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/),
  /** Makes it a subcategory of this top-level category; null makes it top-level. */
  parentId: z.string().min(1).nullable().optional(),
};

export const createCategoryBodySchema = z.object({
  ...categoryFields,
  icon: categoryFields.icon.default("circle"),
  color: categoryFields.color.default("#52D3FE"),
});

/** No defaults here: a patch changes only what it names. */
export const updateCategoryBodySchema = z.object(categoryFields).partial();

export const upsertBudgetBodySchema = z.object({
  categoryId: z.string().min(1),
  period: z.enum(BUDGET_PERIODS),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  limitMajor: amountMajorSchema,
  currency: currencyCode.optional(),
  alertThresholdPct: z.number().min(1).max(100).default(80),
  rollover: z.enum(ROLLOVER_MODES).optional(),
  rolloverSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  renew: z.boolean().optional(),
});

export const saveBudgetTemplateBodySchema = z.object({ name: z.string().trim().min(1).max(80) });

const monthIndex = z.number().int().min(1).max(60);
const signedMinor = z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00);
const changeLabel = z.string().trim().max(80).optional();

/** One what-if change; amounts are base-currency minor units, positive one-off or repeating amounts are money in. */
export const scenarioChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("income"), amountMinor: signedMinor.optional(), pct: z.number().min(-100).max(1000).optional(), fromMonth: monthIndex.optional(), label: changeLabel }),
  z.object({ kind: z.literal("category"), categoryId: z.string().min(1).max(40), amountMinor: signedMinor.optional(), pct: z.number().min(-100).max(1000).optional(), fromMonth: monthIndex.optional(), label: changeLabel }),
  z.object({ kind: z.literal("one_off"), amountMinor: signedMinor, month: monthIndex, label: changeLabel }),
  z.object({ kind: z.literal("recurring"), amountMinor: signedMinor, fromMonth: monthIndex, months: z.number().int().min(1).max(60).nullable().optional(), label: changeLabel }),
]).refine((change) => (change.kind !== "income" && change.kind !== "category") || change.pct == null || change.amountMinor == null, {
  message: "Change it by an amount or a percent, not both",
});

export const scenarioBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  changes: z.array(scenarioChangeSchema).max(30),
});

export const installmentPlanBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  principalMajor: amountMajorSchema,
  currency: currencyCode,
  months: z.number().int().min(2).max(120),
  annualRatePct: z.number().min(0).max(60).default(0),
  taxOnInterestPct: z.number().min(0).max(50).default(0),
  processingFeeMajor: amountMajorSchema.nullable().optional(),
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

export const closeInstallmentBodySchema = z.object({ chargeMajor: amountMajorSchema.nullable().optional() });

export const attachmentBodySchema = z.object({
  storageKey: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(120),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().min(0).max(20 * 1024 * 1024),
});

export const commentBodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const bulkChangeBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BULK),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("delete") }),
    z.object({
      kind: z.literal("update"),
      change: z
        .object({
          categoryId: z.string().min(1).nullable().optional(),
          projectId: z.string().min(1).nullable().optional(),
          clearing: z.enum(["pending", "cleared"]).optional(),
          merchant: z.string().trim().max(120).nullable().optional(),
          addTags: z.array(z.string().trim().max(40)).max(10).optional(),
          removeTags: z.array(z.string().trim().max(40)).max(10).optional(),
        })
        .refine((change) => Object.keys(change).length > 0, { message: "Pick something to change" }),
    }),
  ]),
});

export const bulkCreateBodySchema = z.object({
  transactions: z.array(createTransactionBodySchema).min(1).max(MAX_BULK_CREATE),
});

export const saveViewBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  filters: z.record(z.string(), z.string().max(120)),
});

export const budgetMoveBodySchema = z.object({
  fromBudgetId: z.string().min(1),
  toBudgetId: z.string().min(1),
  amountMajor: amountMajorSchema,
  note: z.string().trim().max(200).nullable().optional(),
});

/** An expense being entered, to check against its budgets: one line, or a split's lines. */
export const budgetCheckBodySchema = z.object({
  lines: z.array(z.object({ categoryId: z.string().min(1), amountMajor: amountMajorSchema })).min(1).max(20),
  currency: currencyCode,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const applyBudgetTemplateBodySchema = z.object({
  templateId: z.string().min(1).max(64),
  monthlyIncomeMajor: amountMajorSchema.nullable().optional(),
});

export const upsertGoalBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetMajor: amountMajorSchema,
  currentMajor: amountMajorSchema.optional(),
  currency: currencyCode.optional(),
  targetDate: z.string().nullable().optional(),
});

export const contributeGoalBodySchema = z.object({
  amountMajor: amountMajorSchema,
});

export const upsertFxRateBodySchema = z.object({
  currency: currencyCode,
  rate: z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter a valid rate"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const exportBodySchema = z.object({
  format: z.enum(["csv", "pdf"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  template: z.enum(["summary", "pool", "approvals"]).default("summary"),
  budgetPoolId: z.string().min(1).nullable().optional(),
});

export const dashboardQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d", "mtd", "fy"]).default("mtd"),
});

export const createPoolBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  limitMajor: amountMajorSchema,
  currency: currencyCode.optional(),
});

export const submitExpenseBodySchema = z.object({
  budgetPoolId: z.string().min(1),
  amountMajor: amountMajorSchema,
  currency: currencyCode,
  categoryId: z.string().min(1).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(2000).nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  receiptStorageKey: z.string().nullable().optional(),
});

export const decideApprovalBodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().max(2000).nullable().optional(),
});

export const createInviteBodySchema = z.object({
  role: z.enum(["approver", "member"]),
});

export const updateMemberBodySchema = z.object({
  role: z.enum(["owner", "approver", "member"]),
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/).optional(),
});

export const updateProjectBodySchema = createProjectBodySchema
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const workspaceSettingsBodySchema = z
  .object({
    fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
    /** Shared workspaces only. */
    purpose: z.enum(WORKSPACE_PURPOSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const meSettingsBodySchema = z.object({
  numberFormat: z.enum(NUMBER_FORMATS),
});

export const envelopeStartBodySchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const envelopeMoveBodySchema = z.object({
  fromCategoryId: z.string().min(1).nullable(),
  toCategoryId: z.string().min(1).nullable(),
  amountMajor: amountMajorSchema,
  note: z.string().trim().max(200).nullable().optional(),
});

export const monthPlanBodySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  expectedIncomeMajor: amountMajorSchema.nullable(),
});

/** A statement to reconcile an account to: its closing balance and the last day it covers. */
export const reconcileAccountBodySchema = z.object({
  statementMajor: signedAmountMajorSchema,
  through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
