import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** One statement import: which file, into which account, and what it added. Its transactions point back here so it can be undone. */
const importBatchSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    fileName: { type: String, required: true, maxlength: 200 },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    rowCount: { type: Number, required: true },
    createdCount: { type: Number, required: true },
    skippedCount: { type: Number, required: true, default: 0 },
    rolledBackAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type ImportBatchDocument = InferSchemaType<typeof importBatchSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ImportBatch: Model<ImportBatchDocument> =
  (models.ImportBatch as Model<ImportBatchDocument>) ||
  model<ImportBatchDocument>("ImportBatch", importBatchSchema, "import_batches");
