import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A workspace's address for emailed receipts and bills (src/core/inbound-email.ts). */
const inboundAddressSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true },
    localPart: { type: String, required: true, unique: true },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    enabled: { type: Boolean, default: true },
    /** Turn emails that say what's due and by when into bills to pay. */
    makeBills: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** One email received at an address, and what came of it; kept 90 days. */
const inboundEmailSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", default: null, index: true },
    from: { type: String, default: null },
    subject: { type: String, default: null, maxlength: 200 },
    messageId: { type: String, default: null },
    status: { type: String, enum: ["accepted", "rejected"], required: true },
    reason: { type: String, default: null },
    receipts: { type: Number, default: 0 },
    paymentId: { type: Schema.Types.ObjectId, ref: "ScheduledPayment", default: null },
    senderId: { type: Schema.Types.ObjectId, ref: "LedgerUser", default: null },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// A relay retrying the same message is handled once.
inboundEmailSchema.index({ workspaceId: 1, messageId: 1 }, { unique: true, partialFilterExpression: { messageId: { $type: "string" }, status: "accepted" } });
inboundEmailSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 86_400 });

export type InboundAddressDocument = InferSchemaType<typeof inboundAddressSchema> & { _id: Types.ObjectId };
export type InboundEmailDocument = InferSchemaType<typeof inboundEmailSchema> & { _id: Types.ObjectId };

export const InboundAddress: Model<InboundAddressDocument> =
  (models.InboundAddress as Model<InboundAddressDocument>) || model<InboundAddressDocument>("InboundAddress", inboundAddressSchema, "inbound_addresses");

export const InboundEmail: Model<InboundEmailDocument> =
  (models.InboundEmail as Model<InboundEmailDocument>) || model<InboundEmailDocument>("InboundEmail", inboundEmailSchema, "inbound_emails");
