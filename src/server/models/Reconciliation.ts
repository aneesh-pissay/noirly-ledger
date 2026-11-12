import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** One time an account was reconciled to a statement (src/server/accounts.ts), for the reconciliation report. */
const reconciliationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    through: { type: Date, required: true },
    statementMinor: { type: Number, required: true },
    currency: { type: String, required: true },
    // Transactions it marked reconciled.
    transactionCount: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

reconciliationSchema.index({ workspaceId: 1, createdAt: -1 });

export type ReconciliationDocument = InferSchemaType<typeof reconciliationSchema> & { _id: Types.ObjectId; createdAt: Date };

export const Reconciliation: Model<ReconciliationDocument> =
  (models.Reconciliation as Model<ReconciliationDocument>) ||
  model<ReconciliationDocument>("Reconciliation", reconciliationSchema, "reconciliations");
