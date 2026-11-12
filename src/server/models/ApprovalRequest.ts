import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { APPROVAL_STATUSES } from "@/src/core/models/enums";

const approvalRequestSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      unique: true,
    },
    budgetPoolId: {
      type: Schema.Types.ObjectId,
      ref: "BudgetPool",
      required: true,
      index: true,
    },
    submittedById: {
      type: Schema.Types.ObjectId,
      ref: "LedgerUser",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: APPROVAL_STATUSES,
      required: true,
      default: "submitted",
      index: true,
    },
    reviewedById: {
      type: Schema.Types.ObjectId,
      ref: "LedgerUser",
      default: null,
    },
    reviewNote: { type: String, default: null },
    // The chain this expense needs, copied from the matching rule when it
    // was submitted (src/core/approval-rules.ts). Empty on requests from
    // before multi-level approvals: one step any approver decides.
    steps: {
      type: [
        new Schema(
          {
            kind: { type: String, required: true },
            userIds: { type: [Schema.Types.ObjectId], default: [] },
            decision: { type: String, enum: ["approved", "rejected", null], default: null },
            decidedById: { type: Schema.Types.ObjectId, ref: "LedgerUser", default: null },
            onBehalfOfId: { type: Schema.Types.ObjectId, ref: "LedgerUser", default: null },
            decidedAt: { type: Date, default: null },
            note: { type: String, default: null },
            // Waiting times (src/core/deadlines.ts): when it became current, and when it was chased.
            startedAt: { type: Date, default: null },
            remindedAt: { type: Date, default: null },
            escalatedAt: { type: Date, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    currentStep: { type: Number, default: 0 },
    ruleName: { type: String, default: null },
    // Submitted after the workspace's deadline, flagged for approvers.
    lateSubmission: {
      type: new Schema({ deadline: String, daysLate: Number }, { _id: false }),
      default: null,
    },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type ApprovalRequestDocument = InferSchemaType<
  typeof approvalRequestSchema
> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ApprovalRequest: Model<ApprovalRequestDocument> =
  (models.ApprovalRequest as Model<ApprovalRequestDocument>) ||
  model<ApprovalRequestDocument>(
    "ApprovalRequest",
    approvalRequestSchema,
    "approval_requests",
  );
