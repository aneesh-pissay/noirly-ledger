import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

export const NOTIFICATION_KINDS = [
  "budget.threshold",
  "approval.requested",
  "approval.decided",
  "goal.reached",
  "recurring.due",
  "bill.reminder",
  "subscription.price",
  "goal.milestone",
] as const;

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "LedgerUser",
      required: true,
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
    },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    href: { type: String, default: null },
    readAt: { type: Date, default: null },
    emailRequested: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & {
  _id: Types.ObjectId;
};

export const Notification: Model<NotificationDocument> =
  (models.LedgerNotification as Model<NotificationDocument>) ||
  model<NotificationDocument>(
    "LedgerNotification",
    notificationSchema,
    "notifications",
  );
