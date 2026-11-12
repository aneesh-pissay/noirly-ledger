import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { GROUP_PERIODS } from "@/src/core/group-budgets";

/**
 * A department, or a team inside one (parentId), with an optional budget
 * per month, quarter or year and the members whose expenses go to it by
 * default; see src/core/group-budgets.ts. Transactions point at it.
 */
const departmentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    parentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    budgetMinor: { type: Number, default: null },
    period: { type: String, enum: GROUP_PERIODS, required: true, default: "monthly" },
    alertPct: { type: Number, required: true, default: 80 },
    memberIds: { type: [Schema.Types.ObjectId], ref: "LedgerUser", default: [] },
    archivedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "LedgerUser", required: true },
  },
  { timestamps: true },
);

export type DepartmentDocument = InferSchemaType<typeof departmentSchema> & { _id: Types.ObjectId };

export const Department: Model<DepartmentDocument> =
  (models.Department as Model<DepartmentDocument>) ||
  model<DepartmentDocument>("Department", departmentSchema, "departments");
