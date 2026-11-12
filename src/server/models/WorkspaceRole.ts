import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A role a workspace defines for itself: a name and exactly what it may do (see customRolePermissions in src/core/permissions/can.ts). */
const workspaceRoleSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    permissions: { type: [String], default: [] },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

workspaceRoleSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export type WorkspaceRoleDocument = InferSchemaType<typeof workspaceRoleSchema> & { _id: Types.ObjectId };

export const WorkspaceRole: Model<WorkspaceRoleDocument> =
  (models.WorkspaceRole as Model<WorkspaceRoleDocument>) ||
  model<WorkspaceRoleDocument>("WorkspaceRole", workspaceRoleSchema, "workspace_roles");
