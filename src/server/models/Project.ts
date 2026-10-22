import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * Something a workspace spends on over time, like a trip, a renovation or a
 * client job. Transactions point at it; its totals aren't stored.
 */
const projectSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    color: { type: String, required: true, trim: true, default: "#C9A227" },
    archivedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type ProjectDocument = InferSchemaType<typeof projectSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Project: Model<ProjectDocument> =
  (models.Project as Model<ProjectDocument>) ||
  model<ProjectDocument>("Project", projectSchema, "projects");
