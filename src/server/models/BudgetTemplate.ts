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

/** One budget in a saved template; the category name is kept so it can be found (or made) in any workspace. */
const templateLineSchema = new Schema(
  {
    categoryName: { type: String, required: true, trim: true },
    period: { type: String, enum: BUDGET_PERIODS, required: true },
    limitMinor: { type: Number, required: true },
    rollover: { type: String, enum: ROLLOVER_MODES, default: "none" },
  },
  { _id: false },
);

/** A workspace's saved set of budgets, applied in one go (built-in templates live in src/core/budgets/templates.ts). */
const budgetTemplateSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    lines: { type: [templateLineSchema], default: [] },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type BudgetTemplateDocument = InferSchemaType<typeof budgetTemplateSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BudgetTemplate: Model<BudgetTemplateDocument> =
  (models.BudgetTemplate as Model<BudgetTemplateDocument>) ||
  model<BudgetTemplateDocument>("BudgetTemplate", budgetTemplateSchema, "budget_templates");
