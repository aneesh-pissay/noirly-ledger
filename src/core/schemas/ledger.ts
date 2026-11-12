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
import { GST_SUPPLIES, GST_TREATMENTS } from "@/src/core/gst";
import { PAYMENT_REPEATS } from "@/src/core/payments";
import { FUND_REPEATS } from "@/src/core/sinking-funds";
import { DEBT_STRATEGIES } from "@/src/core/debts";
import { DATE_FORMATS } from "@/src/core/imports";

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

/** GST settings on a transaction; amounts are worked out on the server. */
export const gstSettingsSchema = z.object({
  ratePct: z.number().min(0).max(40),
  treatment: z.enum(GST_TREATMENTS).default("taxable"),
  supply: z.enum(GST_SUPPLIES).default("intra"),
  gstin: z.string().max(20).nullable().optional(),
  hsn: z.string().max(12).nullable().optional(),
  itcEligible: z.boolean().optional(),
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
  gst: gstSettingsSchema.nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).nullable().optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
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
  /** The account or card number; it's stored sealed and shown masked. Null clears it. */
  number: z.string().trim().max(50).nullable().optional(),
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
  /** GST new transactions in it start with; null for none. */
  defaultGst: gstSettingsSchema.pick({ ratePct: true, treatment: true, supply: true, itcEligible: true }).nullable().optional(),
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

const column = z.number().int().min(0).max(200).nullable();

export const columnMappingSchema = z.object({
  headerRow: z.number().int().min(0).max(50),
  date: column,
  description: column,
  amount: column,
  drCr: column,
  debit: column,
  credit: column,
  reference: column,
  dateFormat: z.enum(DATE_FORMATS),
  chargesPositive: z.boolean().optional(),
  bank: z.string().max(40).nullable().optional(),
});

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
export const duplicateCheckBodySchema = z.object({
  type: z.enum(["expense", "income", "transfer", "refund"]),
  amountMajor: amountMajorSchema,
  currency: currencyCode,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.string().min(1).max(64).nullable().optional(),
  text: z.string().max(500).optional(),
  upiRef: z.string().max(40).nullable().optional(),
  exceptId: z.string().min(1).max(64).nullable().optional(),
});

export const inboxReceiptPatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  amountMajor: amountMajorSchema.nullable().optional(),
  currency: currencyCode.nullable().optional(),
  merchant: z.string().max(80).nullable().optional(),
});

export const matchReceiptBodySchema = z.object({ transactionId: z.string().min(1).max(64) });

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reminderSettingsSchema = z
  .object({
    daysBefore: z.number().int().min(0).max(30).nullable(),
    trialEndsOn: isoDay.nullable(),
    cancelBy: isoDay.nullable(),
  })
  .nullable();

export const paymentBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  amountMajor: amountMajorSchema,
  currency: currencyCode,
  dueDate: isoDay,
  accountId: z.string().min(1).max(64).nullable().optional(),
  categoryId: z.string().min(1).max(64).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  upiId: z.string().max(100).nullable().optional(),
  payeeName: z.string().max(80).nullable().optional(),
  repeat: z.enum(PAYMENT_REPEATS).optional(),
});

export const paymentPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  amountMajor: amountMajorSchema.optional(),
  currency: currencyCode.optional(),
  dueDate: isoDay.optional(),
  accountId: z.string().min(1).max(64).nullable().optional(),
  categoryId: z.string().min(1).max(64).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  upiId: z.string().max(100).nullable().optional(),
  payeeName: z.string().max(80).nullable().optional(),
  repeat: z.enum(PAYMENT_REPEATS).optional(),
});

export const payBodySchema = z.discriminatedUnion("how", [
  z.object({
    how: z.literal("record"),
    paidOn: isoDay,
    amountMajor: amountMajorSchema.nullable().optional(),
    accountId: z.string().min(1).max(64).nullable().optional(),
    upiRef: z.string().max(40).nullable().optional(),
  }),
  z.object({ how: z.literal("link"), transactionId: z.string().min(1).max(64) }),
  z.object({ how: z.literal("mark"), paidOn: isoDay }),
]);

export const sinkingFundBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetMajor: amountMajorSchema,
  currency: currencyCode,
  dueDate: isoDay,
  repeat: z.enum(FUND_REPEATS).optional(),
  savedMajor: amountMajorSchema.optional(),
  ruleId: z.string().min(1).max(64).nullable().optional(),
  paymentId: z.string().min(1).max(64).nullable().optional(),
});

export const sinkingFundPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  targetMajor: amountMajorSchema.optional(),
  dueDate: isoDay.optional(),
  repeat: z.enum(FUND_REPEATS).optional(),
});

export const fundMoveBodySchema = z.object({ amountMajor: amountMajorSchema, direction: z.enum(["in", "out"]) });

export const fundSpentBodySchema = z.object({ spentMajor: amountMajorSchema.nullable().optional() });

export const insightIdBodySchema = z.object({ id: z.string().min(3).max(300) });

export const subscriptionKeyBodySchema = z.object({ key: z.string().min(3).max(200) });

export const notDuplicateBodySchema = z.object({ otherId: z.string().min(1).max(64) });

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

export const cardTermsBodySchema = z
  .object({
    statementDay: z.number().int().min(1).max(31),
    dueDays: z.number().int().min(1).max(60),
    creditLimitMajor: amountMajorSchema.nullable().optional(),
    minimumPct: z.number().min(0).max(100).optional(),
  })
  .nullable();

export const debtSettingsBodySchema = z.object({
  strategy: z.enum(DEBT_STRATEGIES).optional(),
  extraMonthlyMajor: amountMajorSchema.optional(),
  debt: z
    .object({
      accountId: z.string().min(1).max(64),
      annualRatePct: z.number().min(0).max(60).nullable().optional(),
      minimumMajor: amountMajorSchema.nullable().optional(),
    })
    .optional(),
});

export const loanBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  loanAccountId: z.string().min(1).max(64),
  payFromAccountId: z.string().min(1).max(64),
  categoryId: z.string().min(1).max(64).nullable().optional(),
  principalMajor: amountMajorSchema,
  annualRatePct: z.number().min(0).max(60),
  months: z.number().int().min(1).max(480),
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const recordEmiBodySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });

export const pledgeBodySchema = z.object({ monthlyMajor: amountMajorSchema });

export const contributeGoalBodySchema = z.object({
  amountMajor: amountMajorSchema,
  /** The day it went in, for money added before it was recorded here. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const upsertFxRateBodySchema = z.object({
  currency: currencyCode,
  rate: z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter a valid rate"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const exportBodySchema = z.object({
  format: z.enum(["csv", "pdf", "xlsx"]),
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
  /** A starting point: rules, shares and categories such a pool usually needs (src/core/pool-templates.ts). */
  template: z.enum(["trip", "household", "event", "team"]).nullable().optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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
  /** Paid out of their own pocket: pay them back once it's approved. */
  reimburse: z.boolean().optional(),
  merchant: z.string().max(120).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  /** Left out: the submitter's own team or department; null: none. */
  departmentId: z.string().min(1).nullable().optional(),
});

/** An expense being filled in, to see what the spending policies say before submitting. */
export const policyCheckBodySchema = z.object({
  budgetPoolId: z.string().min(1),
  amountMajor: amountMajorSchema,
  currency: currencyCode,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().min(1).nullable().optional(),
  merchant: z.string().max(120).nullable().optional(),
  hasReceipt: z.boolean().default(false),
});

/** A spending policy; amounts in major units of the base currency, blank for none ("0.00" receipt: always). */
export const spendingPolicyBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  categoryIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(50).default([]),
  merchants: z.array(z.string().max(120)).max(50).default([]),
  budgetPoolIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(50).default([]),
  maxMajor: amountMajorSchema.nullable().optional(),
  receiptOverMajor: amountMajorSchema.nullable().optional(),
  disallowed: z.boolean().default(false),
  enforcement: z.enum(["flag", "block"]).default("flag"),
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
  /** A custom role to give them, or null to take it away. */
  customRoleId: z.string().min(1).max(64).nullable().optional(),
});

export const customRoleBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  permissions: z.array(z.string().max(40)).max(20),
});

export const customRolePatchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  permissions: z.array(z.string().max(40)).max(20).optional(),
});

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

/** A rule for which expenses need which approvers; amounts in major units of the base currency, blank for open. */
export const approvalRuleBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  minMajor: amountMajorSchema.nullable().optional(),
  maxMajor: amountMajorSchema.nullable().optional(),
  categoryIds: z.array(objectIdSchema).max(50).default([]),
  budgetPoolIds: z.array(objectIdSchema).max(50).default([]),
  steps: z
    .array(z.object({ kind: z.enum(["any", "owners", "members", "pool"]), userIds: z.array(objectIdSchema).max(20).default([]) }))
    .min(1, "Add at least one approval step")
    .max(5, "At most five approval steps"),
});

/** A pool's own approval rules; amounts in major units of the base currency, null for none. */
export const poolRulesBodySchema = z.object({
  approverIds: z.array(objectIdSchema).max(50).default([]),
  autoApproveUpToMajor: amountMajorSchema.nullable().default(null),
  memberLimitMajor: amountMajorSchema.nullable().default(null),
  memberLimits: z.array(z.object({ userId: objectIdSchema, limitMajor: amountMajorSchema })).max(500).default([]),
  memberLimitPeriod: z.enum(["monthly", "pool"]).default("monthly"),
});

/** Money put into a pool, in major units of the base currency; forUserId for recording someone else's. */
export const poolContributionBodySchema = z.object({
  amountMajor: amountMajorSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).nullable().optional(),
  forUserId: objectIdSchema.nullable().optional(),
});

/**
 * Who's expected to put what in: "equal" (values ignored), "percent"
 * (whole or decimal percentages adding to 100), or "amount" (major units).
 */
export const poolAllocationBodySchema = z.object({
  mode: z.enum(["none", "equal", "percent", "amount"]),
  targetMajor: amountMajorSchema.nullable().default(null),
  shares: z.array(z.object({ userId: objectIdSchema, value: z.string().trim().regex(/^\d+(\.\d{1,2})?$/).default("0") })).max(200).default([]),
});

/** A report emailed on a schedule to members of the workspace. */
export const scheduledExportBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  format: z.enum(["csv", "pdf", "xlsx"]),
  template: z.enum(["summary", "pool", "approvals"]).default("summary"),
  budgetPoolId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
  frequency: z.enum(["weekly", "monthly"]),
  runDay: z.number().int(),
  recipientIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(50),
  paused: z.boolean().optional(),
});

/** A dashboard layout: widgets in order with their width; null resets to the default. */
export const dashboardLayoutBodySchema = z.object({
  widgets: z.array(z.object({ type: z.string().max(40), size: z.enum(["half", "full"]) })).max(20).nullable(),
});

/** A rule for incoming transactions (src/core/auto-rules.ts); amounts in major units, blank for open. */
export const transactionRuleBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  field: z.enum(["any", "note", "merchant"]).default("any"),
  op: z.enum(["contains", "starts_with", "equals"]).default("contains"),
  value: z.string().trim().min(1).max(120),
  type: z.enum(["expense", "income"]).nullable().default(null),
  accountId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().default(null),
  minMajor: amountMajorSchema.nullable().default(null),
  maxMajor: amountMajorSchema.nullable().default(null),
  set: z.object({
    categoryId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().default(null),
    merchant: z.string().max(120).nullable().default(null),
    tags: z.array(z.string().max(40)).max(10).default([]),
    projectId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().default(null),
  }),
});

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

/** A workflow (src/core/workflows.ts): when, if, then. */
export const workflowBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  trigger: z.enum(["transaction.added", "expense.submitted", "expense.approved", "expense.rejected", "budget.alert"]),
  conditions: z
    .array(z.object({ field: z.enum(["type", "amount", "category", "merchant", "account", "tag", "pool", "member"]), op: z.enum(["is", "is_not", "contains", "gte", "lte"]), value: z.string().trim().max(120) }))
    .max(10)
    .default([]),
  actions: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.enum(["notify", "email"]), audience: z.enum(["approvers", "owners", "member", "people"]), userIds: z.array(objectId).max(20).default([]), message: z.string().trim().max(500) }),
        z.object({ type: z.literal("add_tags"), tags: z.array(z.string().max(40)).max(10) }),
        z.object({ type: z.literal("set_category"), categoryId: objectId }),
        z.object({ type: z.literal("set_project"), projectId: objectId }),
        z.object({ type: z.literal("comment"), message: z.string().trim().max(500) }),
      ]),
    )
    .max(5),
});

/** An automation (src/core/automations.ts); what its kind needs is checked on the server. */
export const automationBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["digest", "budget_refresh", "sweep"]),
  frequency: z.enum(["weekly", "monthly"]),
  runDay: z.number().int(),
  paused: z.boolean().optional(),
  params: z.object({
    recipientIds: z.array(objectId).max(50).default([]),
    email: z.boolean().default(false),
    months: z.number().int().min(1).max(12).default(3),
    adjustPct: z.number().min(-50).max(100).default(0),
    categoryIds: z.array(objectId).max(100).default([]),
    goalId: objectId.nullable().default(null),
    sweepPct: z.number().min(1).max(100).default(100),
  }),
});

const channelsSchema = z.object({ inApp: z.boolean(), email: z.boolean() });

/** Someone's notification settings for a workspace (src/core/notification-prefs.ts); the large-expense amount in major units. */
export const notificationPrefsBodySchema = z.object({
  channels: z.object({
    budgets: channelsSchema,
    bills: channelsSchema,
    large: channelsSchema,
    approvals: channelsSchema,
    goals: channelsSchema,
    subscriptions: channelsSchema,
    automations: channelsSchema,
  }),
  budgetLevels: z.array(z.number().int().min(1).max(200)).max(5),
  billDaysBefore: z.number().int().min(0).max(30),
  largeExpenseMajor: amountMajorSchema.nullable(),
});

/** A link to Noirly Flow (src/core/flow-sync.ts); the token is left out to keep the one saved. */
export const flowLinkBodySchema = z.object({
  token: z.string().trim().max(200).nullable().optional(),
  flowWorkspaceId: objectId,
  flowProjectId: objectId.nullable().default(null),
  bills: z.boolean(),
  reminders: z.boolean(),
  daysAhead: z.number().int().min(1).max(31),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]),
  paused: z.boolean().optional(),
});

export const flowLookupBodySchema = z.object({
  token: z.string().trim().max(200).nullable().optional(),
  flowWorkspaceId: objectId.nullable().optional(),
});

/** A personal access token to make: a name, read or write, and days to live (0: never expires). */
export const accessTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  scope: z.enum(["read", "write"]),
  days: z.union([z.literal(30), z.literal(90), z.literal(365), z.literal(0)]),
});

/** A webhook (src/core/webhooks.ts); events are checked on the server. */
export const webhookBodySchema = z.object({
  url: z.string().trim().min(1).max(2000),
  events: z.array(z.string().max(40)).max(20),
});

export const webhookPatchSchema = z.object({
  url: z.string().trim().min(1).max(2000).optional(),
  events: z.array(z.string().max(40)).max(20).optional(),
  enabled: z.boolean().optional(),
});

/** A workspace's email address for receipts and bills: on or off, and whether bills are made. */
export const inboundOptionsBodySchema = z.object({ enabled: z.boolean(), makeBills: z.boolean() });

const retentionDays = z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]);

/** How long a workspace keeps what it no longer uses (src/core/retention.ts). */
export const retentionBodySchema = z.object({
  deletedTransactionsDays: retentionDays,
  unmatchedReceiptsDays: retentionDays,
  notificationsDays: retentionDays,
});

export const deleteWorkspaceBodySchema = z.object({ confirmName: z.string().max(200) });

/** Two-person approval on or off (src/core/dual-control.ts), and a second owner's decision. */
export const dualControlBodySchema = z.object({ enabled: z.boolean() });
export const pendingDecisionBodySchema = z.object({ decision: z.enum(["approve", "reject"]) });

/** A workspace's backup schedule. */
export const backupScheduleBodySchema = z.object({ enabled: z.boolean(), frequency: z.enum(["daily", "weekly"]) });

/** What a calendar link holds (src/core/calendar-feed.ts). */
export const calendarFeedBodySchema = z.object({
  workspaceIds: z.array(objectId).max(50),
  bills: z.boolean(),
  reminders: z.boolean(),
  showPaid: z.boolean(),
});

/** A report's range and how it's cut into periods (suggested from the range when left out). */
export const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(["week", "month", "quarter", "year"]).optional(),
});

export const approvalRuleOrderSchema = z.object({ ids: z.array(objectIdSchema).max(100) });

/** Someone to approve for you between two days, inclusive. */
export const delegationBodySchema = z.object({
  toUserId: objectIdSchema,
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).nullable().optional(),
});

/** Paying someone back for owed reimbursements. */
export const payoutBodySchema = z.object({
  reimbursementIds: z.array(objectIdSchema).min(1).max(200),
  method: z.enum(["bank", "upi", "cash", "other"]),
  reference: z.string().trim().max(120).nullable().optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const reimbursementQuerySchema = z.object({
  status: z.enum(["pending", "owed", "paid", "void"]).optional(),
});

export const approvalHistoryQuerySchema = z.object({
  approvalId: objectIdSchema.optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/).optional(),
});

export const updateProjectBodySchema = createProjectBodySchema
  .partial()
  .extend({
    archived: z.boolean().optional(),
    /** A budget for the project's whole life, in base currency; null takes it away. */
    budgetMajor: amountMajorSchema.nullable().optional(),
    alertPct: z.number().int().min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

/** A department or team; its budget is per period, in base currency, null for none. */
export const departmentBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  parentId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
  budgetMajor: amountMajorSchema.nullable().optional(),
  period: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  alertPct: z.number().int().min(1).max(100).default(80),
  memberIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(500).default([]),
});

export const departmentPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  parentId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
  budgetMajor: amountMajorSchema.nullable().optional(),
  period: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  alertPct: z.number().int().min(1).max(100).optional(),
  memberIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(500).optional(),
  archived: z.boolean().optional(),
});

export const workspaceSettingsBodySchema = z
  .object({
    fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
    /** Shared workspaces only. */
    purpose: z.enum(WORKSPACE_PURPOSES).optional(),
    /** Fetch exchange rates from the rates provider (src/server/fx-auto.ts). */
    autoFxRates: z.boolean().optional(),
    /** When expenses must be submitted, and when waiting approvals are chased (src/core/deadlines.ts). */
    approvalDeadlines: z
      .object({
        submitWithinDays: z.number().int().min(0).max(365).nullable(),
        monthCloseDay: z.number().int().min(1).max(28).nullable(),
        lateSubmission: z.enum(["flag", "block"]),
        remindAfterDays: z.number().int().min(0).max(90).nullable(),
        escalateAfterDays: z.number().int().min(0).max(90).nullable(),
      })
      .optional(),
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
