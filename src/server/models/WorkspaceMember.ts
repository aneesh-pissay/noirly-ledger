import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { MEMBER_ROLES } from "@/src/core/models/enums";

const workspaceMemberSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "LedgerUser",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: MEMBER_ROLES,
      required: true,
    },
    // A custom role the workspace defined; when set, it decides what the member may do (never for an owner).
    customRoleId: { type: Schema.Types.ObjectId, ref: "WorkspaceRole", default: null },
  },
  { timestamps: true },
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export type WorkspaceMemberDocument = InferSchemaType<
  typeof workspaceMemberSchema
> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const WorkspaceMember: Model<WorkspaceMemberDocument> =
  (models.WorkspaceMember as Model<WorkspaceMemberDocument>) ||
  model<WorkspaceMemberDocument>(
    "WorkspaceMember",
    workspaceMemberSchema,
    "workspace_members",
  );
