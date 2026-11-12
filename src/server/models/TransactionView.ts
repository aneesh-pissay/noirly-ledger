import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A saved transaction search: a name and its filters (see ViewFilters in src/core/search.ts), shared in the workspace. */
const transactionViewSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    filters: { type: Schema.Types.Mixed, default: {} },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type TransactionViewDocument = InferSchemaType<typeof transactionViewSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const TransactionView: Model<TransactionViewDocument> =
  (models.TransactionView as Model<TransactionViewDocument>) ||
  model<TransactionViewDocument>("TransactionView", transactionViewSchema, "transaction_views");
