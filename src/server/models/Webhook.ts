import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { WEBHOOK_EVENTS } from "@/src/core/webhooks";

/**
 * A workspace's outgoing webhook (src/core/webhooks.ts). The signing secret
 * is kept as it is because every delivery is signed with it; it's only ever
 * shown when made or rotated.
 */
const webhookSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    url: { type: String, required: true, maxlength: 2000 },
    secret: { type: String, required: true },
    events: { type: [{ type: String, enum: WEBHOOK_EVENTS }], default: [] },
    enabled: { type: Boolean, default: true },
    disabledReason: { type: String, default: null },
    // Deliveries in a row that failed for good; reset by any success.
    failureStreak: { type: Number, default: 0 },
    lastDeliveryAt: { type: Date, default: null },
    lastStatus: { type: String, enum: ["succeeded", "failed", null], default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type WebhookDocument = InferSchemaType<typeof webhookSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Webhook: Model<WebhookDocument> =
  (models.Webhook as Model<WebhookDocument>) ||
  model<WebhookDocument>("Webhook", webhookSchema, "webhooks");

/** One event on its way to one webhook, with its last try. Kept for 30 days. */
const webhookDeliverySchema = new Schema(
  {
    webhookId: { type: Schema.Types.ObjectId, ref: "Webhook", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    // The whole event as sent, so retries send the same body.
    event: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["pending", "succeeded", "failed"], default: "pending" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    lastStatusCode: { type: Number, default: null },
    lastError: { type: String, default: null },
    lastResponse: { type: String, default: null },
    lastDurationMs: { type: Number, default: null },
  },
  { timestamps: true },
);

webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
webhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86_400 });

export type WebhookDeliveryDocument = InferSchemaType<typeof webhookDeliverySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const WebhookDelivery: Model<WebhookDeliveryDocument> =
  (models.WebhookDelivery as Model<WebhookDeliveryDocument>) ||
  model<WebhookDeliveryDocument>("WebhookDelivery", webhookDeliverySchema, "webhook_deliveries");
