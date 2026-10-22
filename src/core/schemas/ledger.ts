import { z } from "zod";
import {
  BUDGET_PERIODS,
  RECURRENCE_FREQUENCIES,
  TRANSACTION_TYPES,
} from "@/src/core/models/enums";
import { ACCOUNT_KINDS } from "@/src/core/accounts";
import { CLEARING_STATES } from "@/src/core/clearing";

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
  range: z.enum(["7d", "30d", "90d", "mtd"]).default("mtd"),
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

/** A statement to reconcile an account to: its closing balance and the last day it covers. */
export const reconcileAccountBodySchema = z.object({
  statementMajor: signedAmountMajorSchema,
  through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
