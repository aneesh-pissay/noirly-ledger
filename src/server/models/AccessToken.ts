import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A personal access token for the API (src/core/access-tokens.ts). Only its hash is stored. */
const accessTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    scope: { type: String, enum: ["read", "write"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    // The token's first and last characters, so people can tell tokens apart.
    hint: { type: String, required: true },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type AccessTokenDocument = InferSchemaType<typeof accessTokenSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AccessToken: Model<AccessTokenDocument> =
  (models.AccessToken as Model<AccessTokenDocument>) ||
  model<AccessTokenDocument>("AccessToken", accessTokenSchema, "access_tokens");
