import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { TEXT_FIELDS, TEXT_OPS } from "@/src/core/auto-rules";

/** A rule for incoming transactions: when the text matches, fill in category, merchant, tags or project (src/core/auto-rules.ts). */
const transactionRuleSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    order: { type: Number, required: true, default: 0 },
    field: { type: String, enum: TEXT_FIELDS, required: true, default: "any" },
    op: { type: String, enum: TEXT_OPS, required: true, default: "contains" },
    value: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ["expense", "income", null], default: null },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    minMinor: { type: Number, default: null },
    maxMinor: { type: Number, default: null },
    set: {
      type: new Schema(
        {
          categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
          merchant: { type: String, default: null },
          tags: { type: [String], default: [] },
          projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
        },
        { _id: false },
      ),
      required: true,
    },
    /** How many transactions it has filled in. */
    appliedCount: { type: Number, default: 0 },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type TransactionRuleDocument = InferSchemaType<typeof transactionRuleSchema> & { _id: Types.ObjectId };

export const TransactionRule: Model<TransactionRuleDocument> =
  (models.TransactionRule as Model<TransactionRuleDocument>) ||
  model<TransactionRuleDocument>("TransactionRule", transactionRuleSchema, "transaction_rules");
