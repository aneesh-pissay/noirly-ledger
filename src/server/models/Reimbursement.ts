import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { PAYOUT_METHODS, REIMBURSEMENT_STATUSES } from "@/src/core/reimbursements";

/** An expense someone paid themselves, to be paid back; see src/core/reimbursements.ts. One per expense. */
const reimbursementSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true, unique: true },
    approvalId: { type: Schema.Types.ObjectId, ref: "ApprovalRequest", required: true, index: true },
    claimantId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    status: { type: String, enum: REIMBURSEMENT_STATUSES, required: true, default: "pending" },
    /** In the workspace's base currency. */
    amountMinor: { type: Number, required: true },
    currency: { type: String, required: true },
    payoutId: { type: Schema.Types.ObjectId, ref: "Payout", default: null },
  },
  { timestamps: true },
);

reimbursementSchema.index({ workspaceId: 1, status: 1, claimantId: 1 });

export type ReimbursementDocument = InferSchemaType<typeof reimbursementSchema> & { _id: Types.ObjectId };

export const Reimbursement: Model<ReimbursementDocument> =
  (models.Reimbursement as Model<ReimbursementDocument>) ||
  model<ReimbursementDocument>("Reimbursement", reimbursementSchema, "reimbursements");

/** Money paid back to one person, settling one or more reimbursements. Undone, its reimbursements are owed again. */
const payoutSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    claimantId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    paidById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    amountMinor: { type: Number, required: true },
    currency: { type: String, required: true },
    method: { type: String, enum: PAYOUT_METHODS, required: true },
    reference: { type: String, default: null, maxlength: 120 },
    paidOn: { type: String, required: true },
    reimbursementIds: { type: [Schema.Types.ObjectId], default: [] },
    undoneAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type PayoutDocument = InferSchemaType<typeof payoutSchema> & { _id: Types.ObjectId };

export const Payout: Model<PayoutDocument> =
  (models.Payout as Model<PayoutDocument>) || model<PayoutDocument>("Payout", payoutSchema, "payouts");
