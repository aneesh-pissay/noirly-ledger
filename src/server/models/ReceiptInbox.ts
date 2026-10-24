import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * A receipt uploaded on its own, waiting to be matched to its transaction
 * (see src/core/receipts.ts). Matching attaches the file to the transaction
 * and keeps this record, pointing at it.
 */
const receiptInboxSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    storageKey: { type: String, required: true },
    name: { type: String, required: true, maxlength: 200 },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    // What it's for, from its file name or typed in.
    date: { type: String, default: null },
    amountMinor: { type: Number, default: null },
    currency: { type: String, default: null },
    merchant: { type: String, default: null },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null, index: true },
    matchedAt: { type: Date, default: null },
    uploadedById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type ReceiptInboxDocument = InferSchemaType<typeof receiptInboxSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ReceiptInbox: Model<ReceiptInboxDocument> =
  (models.ReceiptInbox as Model<ReceiptInboxDocument>) ||
  model<ReceiptInboxDocument>("ReceiptInbox", receiptInboxSchema, "receipt_inbox");
