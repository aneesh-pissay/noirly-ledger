import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** Someone's private calendar link (src/core/calendar-feed.ts); only a hash of its secret is kept. */
const calendarFeedSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true, unique: true },
    tokenHash: { type: String, default: null, index: { unique: true, partialFilterExpression: { tokenHash: { $type: "string" } } } },
    linkCreatedAt: { type: Date, default: null },
    workspaceIds: { type: [Schema.Types.ObjectId], default: [] },
    bills: { type: Boolean, default: true },
    reminders: { type: Boolean, default: true },
    showPaid: { type: Boolean, default: true },
    lastFetchedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type CalendarFeedDocument = InferSchemaType<typeof calendarFeedSchema> & { _id: Types.ObjectId };

export const CalendarFeed: Model<CalendarFeedDocument> =
  (models.CalendarFeed as Model<CalendarFeedDocument>) || model<CalendarFeedDocument>("CalendarFeed", calendarFeedSchema, "calendar_feeds");
