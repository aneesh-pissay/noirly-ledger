import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** Reminders already sent, by key (see reminderKey in src/core/reminders.ts), so each goes once. */
const reminderLogSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    sentAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false },
);

export type ReminderLogDocument = InferSchemaType<typeof reminderLogSchema> & { _id: Types.ObjectId };

export const ReminderLog: Model<ReminderLogDocument> =
  (models.ReminderLog as Model<ReminderLogDocument>) ||
  model<ReminderLogDocument>("ReminderLog", reminderLogSchema, "reminder_log");
