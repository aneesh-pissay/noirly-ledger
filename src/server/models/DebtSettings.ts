import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { DEBT_STRATEGIES } from "@/src/core/debts";

/**
 * A workspace's debt payoff plan: the plan chosen, what extra goes to debt
 * each month, and rates or minimums typed in for debts whose own aren't
 * known (keyed by account id). See src/core/debts.ts.
 */
const debtSettingsSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true },
    strategy: { type: String, enum: DEBT_STRATEGIES, default: "avalanche" },
    extraMonthlyMinor: { type: Number, default: 0 },
    overrides: {
      type: [
        new Schema(
          {
            accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
            annualRatePct: { type: Number, default: null },
            minimumMinor: { type: Number, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

export type DebtSettingsDocument = InferSchemaType<typeof debtSettingsSchema> & { _id: Types.ObjectId };

export const DebtSettings: Model<DebtSettingsDocument> =
  (models.DebtSettings as Model<DebtSettingsDocument>) ||
  model<DebtSettingsDocument>("DebtSettings", debtSettingsSchema, "debt_settings");
