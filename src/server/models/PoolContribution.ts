import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** Money a member put into a pool; see src/core/pool-contributions.ts. Removed ones stay, marked. */
const poolContributionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    poolId: { type: Schema.Types.ObjectId, ref: "BudgetPool", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    /** In the workspace's base currency. */
    amountMinor: { type: Number, required: true },
    date: { type: String, required: true },
    note: { type: String, default: null, maxlength: 200 },
    recordedById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type PoolContributionDocument = InferSchemaType<typeof poolContributionSchema> & { _id: Types.ObjectId };

export const PoolContribution: Model<PoolContributionDocument> =
  (models.PoolContribution as Model<PoolContributionDocument>) ||
  model<PoolContributionDocument>("PoolContribution", poolContributionSchema, "pool_contributions");
