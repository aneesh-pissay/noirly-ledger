import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A loan repaid in EMIs, tied to its loan account; see src/core/loans.ts. */
const loanPlanSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, maxlength: 80 },
    loanAccountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    // Where the EMIs are paid from, and the category its interest counts under.
    payFromAccountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    principalMinor: { type: Number, required: true },
    annualRatePct: { type: Number, required: true },
    months: { type: Number, required: true },
    firstDate: { type: String, required: true },
    currency: { type: String, required: true, uppercase: true },
    // EMIs recorded so far, in order, with the transactions each made.
    payments: {
      type: [
        new Schema(
          {
            number: { type: Number, required: true },
            date: { type: String, required: true },
            transferId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
            interestId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type LoanPlanDocument = InferSchemaType<typeof loanPlanSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const LoanPlan: Model<LoanPlanDocument> =
  (models.LoanPlan as Model<LoanPlanDocument>) ||
  model<LoanPlanDocument>("LoanPlan", loanPlanSchema, "loan_plans");
