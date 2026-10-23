import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * A workspace's zero-based plan for one month: the income it expects, in
 * base currency. What's assigned comes from the budgets themselves.
 */
const budgetPlanSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    // YYYY-MM.
    month: { type: String, required: true },
    expectedIncomeMinor: { type: Number, default: null },
  },
  { timestamps: true },
);

budgetPlanSchema.index({ workspaceId: 1, month: 1 }, { unique: true });

export type BudgetPlanDocument = InferSchemaType<typeof budgetPlanSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BudgetPlan: Model<BudgetPlanDocument> =
  (models.BudgetPlan as Model<BudgetPlanDocument>) ||
  model<BudgetPlanDocument>("BudgetPlan", budgetPlanSchema, "budget_plans");
