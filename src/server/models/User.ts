import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

const userSchema = new Schema(
  {
    identitySub: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    emailVerified: { type: Boolean, default: false },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null },
    baseCurrency: { type: String, required: true, default: "USD", uppercase: true },
    locale: { type: String, required: true, default: "en-US" },
    /** Sessions signed in before this instant are refused (set on sign-out). */
    sessionsRevokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type LedgerUserDocument = InferSchemaType<typeof userSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const LedgerUser: Model<LedgerUserDocument> =
  (models.LedgerUser as Model<LedgerUserDocument>) ||
  model<LedgerUserDocument>("LedgerUser", userSchema, "users");
