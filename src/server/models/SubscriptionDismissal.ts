import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** Charges someone said aren't a subscription, by their grouping key (see subscriptionKey in src/core/subscriptions.ts). */
const subscriptionDismissalSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    key: { type: String, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

subscriptionDismissalSchema.index({ workspaceId: 1, key: 1 }, { unique: true });

export type SubscriptionDismissalDocument = InferSchemaType<typeof subscriptionDismissalSchema> & { _id: Types.ObjectId };

export const SubscriptionDismissal: Model<SubscriptionDismissalDocument> =
  (models.SubscriptionDismissal as Model<SubscriptionDismissalDocument>) ||
  model<SubscriptionDismissalDocument>("SubscriptionDismissal", subscriptionDismissalSchema, "subscription_dismissals");
