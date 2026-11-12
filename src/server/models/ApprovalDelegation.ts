import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** Someone away naming who approves for them, between two days inclusive; see src/core/delegations.ts. */
const approvalDelegationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    startsOn: { type: String, required: true },
    endsOn: { type: String, required: true },
    note: { type: String, default: null, maxlength: 200 },
    /** Ended early, by the person away or an owner. */
    endedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type ApprovalDelegationDocument = InferSchemaType<typeof approvalDelegationSchema> & { _id: Types.ObjectId; createdAt: Date };

export const ApprovalDelegation: Model<ApprovalDelegationDocument> =
  (models.ApprovalDelegation as Model<ApprovalDelegationDocument>) ||
  model<ApprovalDelegationDocument>("ApprovalDelegation", approvalDelegationSchema, "approval_delegations");
