import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { ACCOUNT_KINDS } from "@/src/core/accounts";

/**
 * Where money is kept or owed: cash, a bank account, a wallet, a credit card
 * or a loan. The balance isn't stored; it's the opening balance plus the
 * account's posted transactions (see src/core/accounts.ts).
 */
const accountSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: ACCOUNT_KINDS, required: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    // In minor units of `currency`: what was in it (or owed on it) on openingDate.
    openingBalanceMinor: { type: Number, required: true, default: 0 },
    openingDate: { type: Date, required: true },
    institution: { type: String, default: null, trim: true, maxlength: 80 },
    archivedAt: { type: Date, default: null },
    // The last statement it was reconciled to: the day it ran through and its balance then.
    reconciledThrough: { type: Date, default: null },
    reconciledBalanceMinor: { type: Number, default: null },
    // Credit cards: when the statement is made up, days to pay it, the limit and the minimum share (see src/core/credit-cards.ts).
    cardTerms: {
      type: new Schema(
        {
          statementDay: { type: Number, required: true },
          dueDays: { type: Number, required: true },
          creditLimitMinor: { type: Number, default: null },
          minimumPct: { type: Number, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type AccountDocument = InferSchemaType<typeof accountSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Account: Model<AccountDocument> =
  (models.Account as Model<AccountDocument>) ||
  model<AccountDocument>("Account", accountSchema, "accounts");
