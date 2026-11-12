import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { EXPORT_FORMATS, EXPORT_FREQUENCIES } from "@/src/core/export-schedules";

/** A report emailed to members on a schedule; see src/core/export-schedules.ts and src/server/scheduled-exports.ts. */
const scheduledExportSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    format: { type: String, enum: EXPORT_FORMATS, required: true },
    template: { type: String, enum: ["summary", "pool", "approvals"], required: true, default: "summary" },
    budgetPoolId: { type: Schema.Types.ObjectId, ref: "BudgetPool", default: null },
    frequency: { type: String, enum: EXPORT_FREQUENCIES, required: true },
    runDay: { type: Number, required: true },
    /** Members it goes to; anyone who has left is skipped. */
    recipientIds: { type: [Schema.Types.ObjectId], ref: "LedgerUser", default: [] },
    nextRunOn: { type: String, required: true, index: true },
    paused: { type: Boolean, default: false },
    lastRunAt: { type: Date, default: null },
    lastRange: { type: new Schema({ from: String, to: String }, { _id: false }), default: null },
    lastSentTo: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

export type ScheduledExportDocument = InferSchemaType<typeof scheduledExportSchema> & { _id: Types.ObjectId };

export const ScheduledExport: Model<ScheduledExportDocument> =
  (models.ScheduledExport as Model<ScheduledExportDocument>) ||
  model<ScheduledExportDocument>("ScheduledExport", scheduledExportSchema, "scheduled_exports");
