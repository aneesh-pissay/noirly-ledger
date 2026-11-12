import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { APPROVER_KINDS } from "@/src/core/approval-rules";

export const approvalStepSchema = new Schema(
  {
    kind: { type: String, enum: APPROVER_KINDS, required: true },
    userIds: { type: [Schema.Types.ObjectId], ref: "LedgerUser", default: [] },
  },
  { _id: false },
);

/** Which expenses need which chain of approvers; see src/core/approval-rules.ts. The lowest order that matches decides. */
const approvalRuleSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    order: { type: Number, required: true, default: 0 },
    minAmountMinor: { type: Number, default: null },
    maxAmountMinor: { type: Number, default: null },
    categoryIds: { type: [Schema.Types.ObjectId], ref: "Category", default: [] },
    budgetPoolIds: { type: [Schema.Types.ObjectId], ref: "BudgetPool", default: [] },
    steps: { type: [approvalStepSchema], default: [] },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type ApprovalRuleDocument = InferSchemaType<typeof approvalRuleSchema> & { _id: Types.ObjectId };

export const ApprovalRule: Model<ApprovalRuleDocument> =
  (models.ApprovalRule as Model<ApprovalRuleDocument>) ||
  model<ApprovalRuleDocument>("ApprovalRule", approvalRuleSchema, "approval_rules");
