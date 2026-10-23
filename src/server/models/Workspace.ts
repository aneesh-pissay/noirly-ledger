import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { WORKSPACE_KINDS } from "@/src/core/models/enums";
import { WORKSPACE_PURPOSES } from "@/src/core/workspace-purpose";

const workspaceSchema = new Schema(
  {
    kind: {
      type: String,
      enum: WORKSPACE_KINDS,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "LedgerUser",
      required: true,
      index: true,
    },
    baseCurrency: {
      type: String,
      required: true,
      default: "USD",
      uppercase: true,
      trim: true,
    },
    // Month (1–12) the financial year starts in; unset means the default for the base currency (see src/core/locale-format.ts).
    fiscalYearStartMonth: { type: Number, min: 1, max: 12, default: null },
    // Shared workspaces: what it's for, which shapes its pages (see src/core/workspace-purpose.ts).
    purpose: { type: String, enum: WORKSPACE_PURPOSES, default: "team" },
    // When envelope budgeting started; null until it's turned on (see src/server/envelopes.ts).
    envelopesSince: { type: Date, default: null },
  },
  { timestamps: true },
);

// One personal workspace per user. Run scripts/merge-duplicate-personal-workspaces.mjs
// first on a database that already has duplicates, or this index cannot build.
workspaceSchema.index(
  { ownerUserId: 1 },
  { unique: true, partialFilterExpression: { kind: "personal" }, name: "one_personal_workspace_per_owner" },
);

export type WorkspaceDocument = InferSchemaType<typeof workspaceSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Workspace: Model<WorkspaceDocument> =
  (models.Workspace as Model<WorkspaceDocument>) ||
  model<WorkspaceDocument>("Workspace", workspaceSchema, "workspaces");
