import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { FLOW_PRIORITIES } from "@/src/core/flow-sync";

/** One person's link from a Ledger workspace to a Noirly Flow workspace (src/core/flow-sync.ts). */
const flowLinkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    /** The Flow access token, sealed (src/server/security/secret-box.ts); only its last four are shown. */
    tokenSealed: { type: String, required: true },
    tokenHint: { type: String, required: true },
    flowWorkspaceId: { type: String, required: true },
    flowWorkspaceName: { type: String, required: true },
    flowProjectId: { type: String, default: null },
    flowProjectName: { type: String, default: null },
    bills: { type: Boolean, default: true },
    reminders: { type: Boolean, default: true },
    daysAhead: { type: Number, default: 7 },
    priority: { type: String, enum: FLOW_PRIORITIES, default: "medium" },
    paused: { type: Boolean, default: false },
    lastSyncAt: { type: Date, default: null },
    lastResult: { type: String, default: null },
    lastOk: { type: Boolean, default: null },
    /** Held by a running sync, so two at once don't both make tasks. */
    syncLockUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

flowLinkSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

/** A task Ledger made in Flow, and what it last did to it. */
const flowTaskSchema = new Schema(
  {
    linkId: { type: Schema.Types.ObjectId, ref: "FlowLink", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    key: { type: String, required: true },
    flowTaskId: { type: String, required: true },
    dueDate: { type: String, required: true },
    state: { type: String, enum: ["open", "done", "canceled"], default: "open" },
  },
  { timestamps: true },
);

flowTaskSchema.index({ linkId: 1, key: 1 }, { unique: true });
// Closed tasks are only kept so they aren't made again; a year covers any bill's window.
flowTaskSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 366 * 86_400, partialFilterExpression: { state: { $in: ["done", "canceled"] } } });

export type FlowLinkDocument = InferSchemaType<typeof flowLinkSchema> & { _id: Types.ObjectId };
export type FlowTaskDocument = InferSchemaType<typeof flowTaskSchema> & { _id: Types.ObjectId };

export const FlowLink: Model<FlowLinkDocument> =
  (models.FlowLink as Model<FlowLinkDocument>) || model<FlowLinkDocument>("FlowLink", flowLinkSchema, "flow_links");

export const FlowTask: Model<FlowTaskDocument> =
  (models.FlowTask as Model<FlowTaskDocument>) || model<FlowTaskDocument>("FlowTask", flowTaskSchema, "flow_tasks");
