import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** One person's dashboard in one workspace: which widgets, in what order, how wide (src/core/dashboard-widgets.ts). */
const dashboardLayoutSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    widgets: {
      type: [new Schema({ type: { type: String, required: true }, size: { type: String, required: true } }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true },
);

dashboardLayoutSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

export type DashboardLayoutDocument = InferSchemaType<typeof dashboardLayoutSchema> & { _id: Types.ObjectId };

export const DashboardLayout: Model<DashboardLayoutDocument> =
  (models.DashboardLayout as Model<DashboardLayoutDocument>) ||
  model<DashboardLayoutDocument>("DashboardLayout", dashboardLayoutSchema, "dashboard_layouts");
