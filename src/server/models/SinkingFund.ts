import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { FUND_REPEATS } from "@/src/core/sinking-funds";

/** Money set aside for a known lump-sum expense; see src/core/sinking-funds.ts. */
const sinkingFundSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, maxlength: 80 },
    targetMinor: { type: Number, required: true },
    savedMinor: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, uppercase: true },
    // This round: from when setting aside began to when the expense is due.
    startDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    repeat: { type: String, enum: FUND_REPEATS, default: "none" },
    // The bill it saves for, if any: a recurring rule or a bill to pay.
    ruleId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: "ScheduledPayment", default: null },
    // A one-off fund is closed once its expense is paid.
    closedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type SinkingFundDocument = InferSchemaType<typeof sinkingFundSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const SinkingFund: Model<SinkingFundDocument> =
  (models.SinkingFund as Model<SinkingFundDocument>) ||
  model<SinkingFundDocument>("SinkingFund", sinkingFundSchema, "sinking_funds");
