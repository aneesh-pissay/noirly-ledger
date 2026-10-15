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

const recurrenceSchema = new Schema(
  {
    frequency: { type: String, enum: RECURRENCE_FREQUENCIES, required: true },
    interval: { type: Number, required: true, default: 1 },
    byMonthDay: { type: Number, default: undefined },
    until: { type: Date, default: null },
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
