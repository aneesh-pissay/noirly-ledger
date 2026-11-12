import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * An EMI purchase: its price, terms and where it's paid from. Its monthly
 * installments are ordinary (future-dated) transactions pointing back here;
 * see src/core/installments.ts for the schedule.
 */
const installmentPlanSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    principalMinor: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true },
    months: { type: Number, required: true },
    annualRatePct: { type: Number, required: true, default: 0 },
    taxOnInterestPct: { type: Number, required: true, default: 0 },
    processingFeeMinor: { type: Number, required: true, default: 0 },
    firstDate: { type: Date, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    // Set when the rest was paid off in one go.
    closedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type InstallmentPlanDocument = InferSchemaType<typeof installmentPlanSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const InstallmentPlan: Model<InstallmentPlanDocument> =
  (models.InstallmentPlan as Model<InstallmentPlanDocument>) ||
  model<InstallmentPlanDocument>("InstallmentPlan", installmentPlanSchema, "installment_plans");
