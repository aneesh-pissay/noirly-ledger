import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { PAYMENT_REPEATS } from "@/src/core/payments";

/** A bill paid by hand, with a due date; see src/core/payments.ts. */
const scheduledPaymentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, maxlength: 80 },
    amountMinor: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true },
    dueDate: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    note: { type: String, default: null },
    repeat: { type: String, enum: PAYMENT_REPEATS, default: "none" },
    // The day of the month a repeating one falls on, so short months don't move it for good.
    dayOfMonth: { type: Number, default: null },
    paidOn: { type: String, default: null },
    paidAmountMinor: { type: Number, default: null },
    // The expense it was paid with, if any; recordedHere when marking it paid created that expense.
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null, index: true },
    recordedHere: { type: Boolean, default: false },
    // The one before it in a repeating series, which made this one when it was paid.
    previousId: { type: Schema.Types.ObjectId, ref: "ScheduledPayment", default: null, index: true },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

scheduledPaymentSchema.index({ workspaceId: 1, dueDate: 1 });

export type ScheduledPaymentDocument = InferSchemaType<typeof scheduledPaymentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ScheduledPayment: Model<ScheduledPaymentDocument> =
  (models.ScheduledPayment as Model<ScheduledPaymentDocument>) ||
  model<ScheduledPaymentDocument>("ScheduledPayment", scheduledPaymentSchema, "scheduled_payments");
