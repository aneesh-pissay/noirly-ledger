import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { APPROVAL_EVENT_KINDS } from "@/src/core/delegations";

/**
 * The approval history: one entry per submission, decision, withdrawal and
 * delegation, written once and never changed (see src/server/approval-history.ts).
 */
const approvalEventSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    kind: { type: String, enum: APPROVAL_EVENT_KINDS, required: true },
    approvalId: { type: Schema.Types.ObjectId, ref: "ApprovalRequest", default: null, index: true },
    /** Null when Ledger itself did it: a reminder or an escalation. */
    actorId: { type: Schema.Types.ObjectId, ref: "LedgerUser", default: null },
    /** For a delegate's decision: the person away. For a delegation: the delegate. */
    otherUserId: { type: Schema.Types.ObjectId, ref: "LedgerUser", default: null },
    step: { type: Number, default: null },
    stepCount: { type: Number, default: null },
    note: { type: String, default: null },
    /** The expense as it read then ("Taxi · USD 12.00"), so the entry stands on its own. */
    summary: { type: String, default: null },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

approvalEventSchema.index({ workspaceId: 1, at: -1 });

// Entries are history: nothing updates them once written.
for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"] as const) {
  approvalEventSchema.pre(op, function () {
    throw new Error("Approval history can't be changed");
  });
}

export type ApprovalEventDocument = InferSchemaType<typeof approvalEventSchema> & { _id: Types.ObjectId };

export const ApprovalEvent: Model<ApprovalEventDocument> =
  (models.ApprovalEvent as Model<ApprovalEventDocument>) ||
  model<ApprovalEventDocument>("ApprovalEvent", approvalEventSchema, "approval_events");
