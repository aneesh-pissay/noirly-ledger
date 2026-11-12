import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { TRIGGERS } from "@/src/core/workflows";

/** When something happens and it fits the conditions, do the actions; see src/core/workflows.ts. */
const workflowSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    enabled: { type: Boolean, default: true },
    trigger: { type: String, enum: TRIGGERS, required: true },
    conditions: {
      type: [new Schema({ field: String, op: String, value: String }, { _id: false })],
      default: [],
    },
    /** Checked when saved (workflowProblem); kept as given. */
    actions: { type: [Schema.Types.Mixed], default: [] },
    runCount: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

workflowSchema.index({ workspaceId: 1, trigger: 1, enabled: 1 });

export type WorkflowDocument = InferSchemaType<typeof workflowSchema> & { _id: Types.ObjectId };

export const Workflow: Model<WorkflowDocument> =
  (models.Workflow as Model<WorkflowDocument>) || model<WorkflowDocument>("Workflow", workflowSchema, "workflows");

/** One run of a workflow: what set it off and what each action did. Kept six months. */
const workflowRunSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    workflowId: { type: Schema.Types.ObjectId, ref: "Workflow", required: true, index: true },
    trigger: { type: String, required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    summary: { type: String, default: null },
    results: { type: [String], default: [] },
    ok: { type: Boolean, required: true },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

workflowRunSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 183 });

export type WorkflowRunDocument = InferSchemaType<typeof workflowRunSchema> & { _id: Types.ObjectId };

export const WorkflowRun: Model<WorkflowRunDocument> =
  (models.WorkflowRun as Model<WorkflowRunDocument>) || model<WorkflowRunDocument>("WorkflowRun", workflowRunSchema, "workflow_runs");
