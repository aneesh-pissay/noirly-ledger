import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { REVISION_REASONS } from "@/src/core/budgets/revisions";

/**
 * One change to a budget's limit, kept after the budget itself is gone.
 * A move between budgets writes two, sharing a moveId.
 */
const budgetRevisionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    budgetId: { type: Schema.Types.ObjectId, ref: "Budget", required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    period: { type: String, required: true },
    // null before it existed, or after it was deleted.
    previousLimitMinor: { type: Number, default: null },
    limitMinor: { type: Number, default: null },
    reason: { type: String, enum: REVISION_REASONS, required: true },
    note: { type: String, default: null, maxlength: 200 },
    moveId: { type: String, default: null },
    // The other budget in a move.
    otherBudgetId: { type: Schema.Types.ObjectId, ref: "Budget", default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

budgetRevisionSchema.index({ workspaceId: 1, createdAt: -1 });

export type BudgetRevisionDocument = InferSchemaType<typeof budgetRevisionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BudgetRevision: Model<BudgetRevisionDocument> =
  (models.BudgetRevision as Model<BudgetRevisionDocument>) ||
  model<BudgetRevisionDocument>("BudgetRevision", budgetRevisionSchema, "budget_revisions");
