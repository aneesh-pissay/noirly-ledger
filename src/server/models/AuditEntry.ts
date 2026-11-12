import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { AUDIT_ENTITIES } from "@/src/core/audit";

/**
 * One entry in a workspace's audit history (src/core/audit.ts), chained to
 * the one before by its hash. Entries are only ever added: changing or
 * deleting one through the app throws, and doing it any other way breaks
 * the chain. The only way out is all of a workspace's entries at once, when
 * its data is deleted, with `{ auditPurge: true }`.
 */
const auditEntrySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    seq: { type: Number, required: true },
    at: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "LedgerUser", default: null },
    // As they were named then, so the history reads the same after they leave.
    actorName: { type: String, default: null },
    action: { type: String, required: true },
    entity: { type: String, enum: AUDIT_ENTITIES, required: true },
    entityId: { type: String, default: null },
    summary: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: null },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { timestamps: false, minimize: false },
);

auditEntrySchema.index({ workspaceId: 1, seq: 1 }, { unique: true });
auditEntrySchema.index({ workspaceId: 1, entity: 1, seq: -1 });
auditEntrySchema.index({ workspaceId: 1, actorId: 1, seq: -1 });

function refuse(): never {
  throw new Error("Audit entries can't be changed or deleted");
}

auditEntrySchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "findOneAndDelete", "deleteOne"], refuse);
auditEntrySchema.pre("deleteMany", function () {
  if (!this.getOptions().auditPurge) refuse();
});
auditEntrySchema.pre("save", function () {
  if (!this.isNew) refuse();
});

export type AuditEntryDocument = InferSchemaType<typeof auditEntrySchema> & { _id: Types.ObjectId };

export const AuditEntry: Model<AuditEntryDocument> =
  (models.AuditEntry as Model<AuditEntryDocument>) || model<AuditEntryDocument>("AuditEntry", auditEntrySchema, "audit_entries");
