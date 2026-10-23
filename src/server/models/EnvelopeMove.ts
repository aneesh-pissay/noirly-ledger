import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * Money given to an envelope, taken back, or moved between envelopes, in base
 * currency. A null category is Ready to assign. Envelope balances are these
 * moves less spending (see src/core/envelopes.ts).
 */
const envelopeMoveSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    fromCategoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    toCategoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    amountMinor: { type: Number, required: true },
    note: { type: String, default: null, maxlength: 200 },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

envelopeMoveSchema.index({ workspaceId: 1, createdAt: -1 });

export type EnvelopeMoveDocument = InferSchemaType<typeof envelopeMoveSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const EnvelopeMove: Model<EnvelopeMoveDocument> =
  (models.EnvelopeMove as Model<EnvelopeMoveDocument>) ||
  model<EnvelopeMoveDocument>("EnvelopeMove", envelopeMoveSchema, "envelope_moves");
