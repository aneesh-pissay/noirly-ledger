import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

const savingsGoalSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    targetAmountMinor: { type: Number, required: true },
    currentAmountMinor: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    targetDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    // Saving together: what each member means to put in a month (see src/core/goal-sharing.ts).
    pledges: {
      type: [new Schema({ userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true }, monthlyMinor: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true },
);

export type SavingsGoalDocument = InferSchemaType<typeof savingsGoalSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const SavingsGoal: Model<SavingsGoalDocument> =
  (models.SavingsGoal as Model<SavingsGoalDocument>) ||
  model<SavingsGoalDocument>("SavingsGoal", savingsGoalSchema, "savings_goals");
