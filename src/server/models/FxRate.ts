import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

const fxRateSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    currency: { type: String, required: true, uppercase: true, trim: true },
    /** Fixed-point: 1.0 = 100_000_000 */
    rateToBaseScaled: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true },
    /** Set by hand, or fetched from the rates provider (src/core/fx-provider.ts); a hand-set rate is never overwritten. */
    source: { type: String, enum: ["user", "auto"], default: "user" },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: "LedgerUser",
      required: true,
    },
  },
  { timestamps: true },
);

fxRateSchema.index(
  { workspaceId: 1, currency: 1, effectiveFrom: -1 },
  { unique: true },
);

export type FxRateDocument = InferSchemaType<typeof fxRateSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const FxRate: Model<FxRateDocument> =
  (models.FxRate as Model<FxRateDocument>) ||
  model<FxRateDocument>("FxRate", fxRateSchema, "fx_rates");
