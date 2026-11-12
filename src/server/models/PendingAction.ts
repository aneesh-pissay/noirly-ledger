import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { DUAL_KINDS } from "@/src/core/dual-control";

/** A sensitive change waiting for a second owner (src/core/dual-control.ts), with what's needed to make it. */
const pendingActionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    kind: { type: String, enum: DUAL_KINDS, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, required: true },
    requestedById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled", "failed"], default: "pending" },
    decidedById: { type: Schema.Types.ObjectId, ref: "LedgerUser", default: null },
    decidedAt: { type: Date, default: null },
    // What happened when it was made, if it couldn't be.
    result: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

pendingActionSchema.index({ workspaceId: 1, createdAt: -1 });
// Kept a while after they expire, then gone.
pendingActionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 90 * 86_400 });

export type PendingActionDocument = InferSchemaType<typeof pendingActionSchema> & { _id: Types.ObjectId; createdAt: Date };

export const PendingAction: Model<PendingActionDocument> =
  (models.PendingAction as Model<PendingActionDocument>) || model<PendingActionDocument>("PendingAction", pendingActionSchema, "pending_actions");
