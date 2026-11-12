import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** One person's notification settings in one workspace (src/core/notification-prefs.ts); missing topics use the defaults. */
const notificationPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    channels: { type: Schema.Types.Mixed, default: {} },
    budgetLevels: { type: [Number], default: [] },
    billDaysBefore: { type: Number, default: null },
    largeExpenseMinor: { type: Number, default: null },
  },
  { timestamps: true, minimize: false },
);

notificationPreferenceSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });
notificationPreferenceSchema.index({ workspaceId: 1, largeExpenseMinor: 1 });

export type NotificationPreferenceDocument = InferSchemaType<typeof notificationPreferenceSchema> & { _id: Types.ObjectId };

export const NotificationPreference: Model<NotificationPreferenceDocument> =
  (models.NotificationPreference as Model<NotificationPreferenceDocument>) ||
  model<NotificationPreferenceDocument>("NotificationPreference", notificationPreferenceSchema, "notification_preferences");
