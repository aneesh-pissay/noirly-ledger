import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** Money put into (or taken out of) a savings goal, and on what day; its pace and milestones come from these. */
const goalContributionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    goalId: { type: Schema.Types.ObjectId, ref: "SavingsGoal", required: true, index: true },
    amountMinor: { type: Number, required: true },
    date: { type: String, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type GoalContributionDocument = InferSchemaType<typeof goalContributionSchema> & { _id: Types.ObjectId };

export const GoalContribution: Model<GoalContributionDocument> =
  (models.GoalContribution as Model<GoalContributionDocument>) ||
  model<GoalContributionDocument>("GoalContribution", goalContributionSchema, "goal_contributions");
