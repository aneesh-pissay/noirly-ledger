import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

const budgetPoolSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    limitAmountMinor: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    currentSpendMinor: { type: Number, required: true, default: 0 },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    // The pool's own approvers, auto-approval and per-member limits (src/core/pool-rules.ts).
    approverIds: { type: [Schema.Types.ObjectId], ref: "LedgerUser", default: [] },
    autoApproveUpToMinor: { type: Number, default: null },
    memberLimitMinor: { type: Number, default: null },
    memberLimits: {
      type: [new Schema({ userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true }, limitMinor: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
    memberLimitPeriod: { type: String, enum: ["monthly", "pool"], default: "monthly" },
    // The template it started from (src/core/pool-templates.ts), for showing.
    template: { type: String, enum: ["trip", "household", "event", "team", null], default: null },
    // Who's expected to pay what into it (src/core/pool-contributions.ts).
    allocationMode: { type: String, enum: ["none", "equal", "percent", "amount"], default: "none" },
    allocationTargetMinor: { type: Number, default: null },
    allocationShares: {
      type: [new Schema({ userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true }, value: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true },
);

export type BudgetPoolDocument = InferSchemaType<typeof budgetPoolSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BudgetPool: Model<BudgetPoolDocument> =
  (models.BudgetPool as Model<BudgetPoolDocument>) ||
  model<BudgetPoolDocument>("BudgetPool", budgetPoolSchema, "budget_pools");
