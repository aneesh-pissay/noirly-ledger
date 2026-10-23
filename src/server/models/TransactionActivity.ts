import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { HISTORY_ACTIONS } from "@/src/core/history";

/** One entry in a transaction's change history (see src/core/history.ts); kept after the transaction is deleted. */
const transactionChangeSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    action: { type: String, enum: HISTORY_ACTIONS, required: true },
    // Field changes for "updated": [{ field, from, to }].
    changes: { type: [Schema.Types.Mixed], default: [] },
    // A short note for other actions, like an attachment's name.
    detail: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/** A comment on a transaction by someone in the workspace. */
const transactionCommentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    body: { type: String, required: true, maxlength: 2000 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type TransactionChangeDocument = InferSchemaType<typeof transactionChangeSchema> & { _id: Types.ObjectId; createdAt: Date };
export type TransactionCommentDocument = InferSchemaType<typeof transactionCommentSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export const TransactionChange: Model<TransactionChangeDocument> =
  (models.TransactionChange as Model<TransactionChangeDocument>) ||
  model<TransactionChangeDocument>("TransactionChange", transactionChangeSchema, "transaction_changes");

export const TransactionComment: Model<TransactionCommentDocument> =
  (models.TransactionComment as Model<TransactionCommentDocument>) ||
  model<TransactionCommentDocument>("TransactionComment", transactionCommentSchema, "transaction_comments");
