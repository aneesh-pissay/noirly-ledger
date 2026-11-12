import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { AUTOMATION_KINDS } from "@/src/core/automations";
import { EXPORT_FREQUENCIES } from "@/src/core/export-schedules";

/** Something done on a schedule: a digest, a budget refresh or a sweep (src/core/automations.ts). */
const automationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: AUTOMATION_KINDS, required: true },
    frequency: { type: String, enum: EXPORT_FREQUENCIES, required: true },
    runDay: { type: Number, required: true },
    params: {
      type: new Schema(
        {
          recipientIds: { type: [Schema.Types.ObjectId], default: [] },
          email: { type: Boolean, default: false },
          months: { type: Number, default: 3 },
          adjustPct: { type: Number, default: 0 },
          categoryIds: { type: [Schema.Types.ObjectId], default: [] },
          goalId: { type: Schema.Types.ObjectId, default: null },
          sweepPct: { type: Number, default: 100 },
        },
        { _id: false },
      ),
      required: true,
    },
    nextRunOn: { type: String, required: true, index: true },
    paused: { type: Boolean, default: false },
    lastRunAt: { type: Date, default: null },
    lastResult: { type: String, default: null },
    lastOk: { type: Boolean, default: null },
  },
  { timestamps: true },
);

export type AutomationDocument = InferSchemaType<typeof automationSchema> & { _id: Types.ObjectId };

export const Automation: Model<AutomationDocument> =
  (models.Automation as Model<AutomationDocument>) || model<AutomationDocument>("Automation", automationSchema, "automations");
