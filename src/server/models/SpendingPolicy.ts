import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { POLICY_ENFORCEMENTS } from "@/src/core/spending-policies";

/** What the workspace allows on submitted expenses; see src/core/spending-policies.ts. */
const spendingPolicySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    categoryIds: { type: [Schema.Types.ObjectId], ref: "Category", default: [] },
    /** Merchant keys; the names as typed are kept for showing. */
    merchants: { type: [String], default: [] },
    merchantNames: { type: [String], default: [] },
    budgetPoolIds: { type: [Schema.Types.ObjectId], ref: "BudgetPool", default: [] },
    maxAmountMinor: { type: Number, default: null },
    receiptOverMinor: { type: Number, default: null },
    disallowed: { type: Boolean, default: false },
    enforcement: { type: String, enum: POLICY_ENFORCEMENTS, required: true, default: "flag" },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type SpendingPolicyDocument = InferSchemaType<typeof spendingPolicySchema> & { _id: Types.ObjectId };

export const SpendingPolicy: Model<SpendingPolicyDocument> =
  (models.SpendingPolicy as Model<SpendingPolicyDocument>) ||
  model<SpendingPolicyDocument>("SpendingPolicy", spendingPolicySchema, "spending_policies");
