import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** One stored backup of a workspace: its JSON export, gzipped and sealed (src/server/backups.ts). */
const workspaceBackupSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    storage: { type: String, enum: ["r2", "local"], required: true },
    key: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    transactionCount: { type: Number, required: true },
    trigger: { type: String, enum: ["scheduled", "manual"], required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

workspaceBackupSchema.index({ workspaceId: 1, createdAt: -1 });

export type WorkspaceBackupDocument = InferSchemaType<typeof workspaceBackupSchema> & { _id: Types.ObjectId; createdAt: Date };

export const WorkspaceBackup: Model<WorkspaceBackupDocument> =
  (models.WorkspaceBackup as Model<WorkspaceBackupDocument>) ||
  model<WorkspaceBackupDocument>("WorkspaceBackup", workspaceBackupSchema, "workspace_backups");
