import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { BUDGET_PERIODS } from "@/src/core/models/enums";
import { ROLLOVER_MODES } from "@/src/core/budgets/rollover";

const budgetSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    period: { type: String, enum: BUDGET_PERIODS, required: true },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    limitAmountMinor: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    alertThresholdPct: { type: Number, required: true, default: 80 },
    // What happens to what's left at the end of a period (see src/core/budgets/rollover.ts), counted from rolloverSince.
    rollover: { type: String, enum: ROLLOVER_MODES, default: "none" },
    rolloverSince: { type: Date, default: null },
  },
  { timestamps: true },
);

budgetSchema.index(
  { workspaceId: 1, categoryId: 1, period: 1, periodStart: 1 },
  { unique: true },
);

export type BudgetDocument = InferSchemaType<typeof budgetSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Budget: Model<BudgetDocument> =
  (models.Budget as Model<BudgetDocument>) ||
  model<BudgetDocument>("Budget", budgetSchema, "budgets");
