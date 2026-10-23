import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import {
  RECURRENCE_FREQUENCIES,
  TRANSACTION_TYPES,
} from "@/src/core/models/enums";
import { CLEARING_STATES } from "@/src/core/clearing";

const recurrenceSchema = new Schema(
  {
    frequency: { type: String, enum: RECURRENCE_FREQUENCIES, required: true },
    interval: { type: Number, required: true, default: 1 },
    byMonthDay: { type: Number, default: undefined },
    until: { type: Date, default: null },
  },
  { _id: false },
);

// One line of a split: its category and share, in the transaction's currency and in base.
const splitSchema = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    amountMinor: { type: Number, required: true },
    baseAmountMinor: { type: Number, required: true },
    note: { type: String, default: null },
  },
  { _id: false },
);

const transactionSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    amountMinor: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    baseAmountMinor: { type: Number, required: true },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    budgetPoolId: {
      type: Schema.Types.ObjectId,
      ref: "BudgetPool",
      default: null,
      index: true,
    },
    // The account the money went in or out of, if one was chosen; same currency as the account.
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    // Transfers only: the account the money went to, and what it received in that account's currency.
    toAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    toAmountMinor: { type: Number, default: null },
    // Refunds only: the expense this takes back (part or all of).
    refundOfId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
      index: true,
    },
    // Pending, cleared or reconciled against the bank; missing on older rows, which count as cleared.
    clearing: { type: String, enum: CLEARING_STATES, default: "cleared" },
    // Split across categories (two or more lines adding up to amountMinor); empty when not split, and then categoryId applies.
    splits: { type: [splitSchema], default: [] },
    // Free tags (lowercase), who was paid or paid you, and a project; see src/core/labels.ts.
    tags: { type: [String], default: [] },
    merchant: { type: String, default: null },
    merchantKey: { type: String, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null, index: true },
    // EMI payments: the plan, and which payment (0 the processing fee, -1 paying off early).
    installmentPlanId: { type: Schema.Types.ObjectId, ref: "InstallmentPlan", default: null, index: true },
    installmentNumber: { type: Number, default: null },
    date: { type: Date, required: true, index: true },
    note: { type: String, default: null },
    receiptUrl: { type: String, default: null },
    receiptStorageKey: { type: String, default: null },
    isRecurring: { type: Boolean, default: false },
    recurrence: { type: recurrenceSchema, default: null },
    recurringParentId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: "LedgerUser",
      required: true,
      index: true,
    },
    approvalRequestId: {
      type: Schema.Types.ObjectId,
      ref: "ApprovalRequest",
      default: null,
    },
    isPosted: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

transactionSchema.index({ workspaceId: 1, date: -1 });
transactionSchema.index({ "splits.categoryId": 1 });
transactionSchema.index({ workspaceId: 1, tags: 1 });
transactionSchema.index({ workspaceId: 1, merchantKey: 1 });
transactionSchema.index({ budgetPoolId: 1, isPosted: 1 });
// The recurring engine looks up a rule's occurrences by date.
transactionSchema.index({ recurringParentId: 1, date: -1 });

export type TransactionDocument = InferSchemaType<typeof transactionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Transaction: Model<TransactionDocument> =
  (models.Transaction as Model<TransactionDocument>) ||
  model<TransactionDocument>("Transaction", transactionSchema, "transactions");
