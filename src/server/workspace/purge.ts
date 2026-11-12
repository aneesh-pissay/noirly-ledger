import type { Model, Types } from "mongoose";
import * as M from "@/src/server/models";
import { deleteReceipt } from "@/src/server/storage/receipts";
import { removeWorkspaceBackups } from "@/src/server/backups";

/** Every model that keeps records against a workspace, found from the schemas, so one added later isn't missed. */
function workspaceModels(): Array<Model<never>> {
  return (Object.values(M) as unknown[]).filter(
    (value) => typeof value === "function" && "schema" in value && (value as Model<never>).schema?.path?.("workspaceId") !== undefined,
  ) as Array<Model<never>>;
}

/** The receipt and attachment files of some transactions (and inbox receipts), to delete with them. */
export async function receiptKeysOf(filter: Record<string, unknown>) {
  const docs = await M.Transaction.find(filter).select("receiptStorageKey attachments.storageKey").lean();
  return docs.flatMap((t) => [t.receiptStorageKey, ...(t.attachments ?? []).map((a) => a.storageKey)]).filter((k): k is string => Boolean(k));
}

/**
 * Deletes a workspace and everything in it: every record kept against it,
 * receipt and attachment files, backups, and the audit history (the one
 * time that goes).
 */
export async function purgeWorkspace(workspaceId: Types.ObjectId): Promise<void> {
  const files = new Set([
    ...(await receiptKeysOf({ workspaceId })),
    ...(await M.ReceiptInbox.find({ workspaceId }).select("storageKey").lean()).map((r) => r.storageKey),
  ]);
  await Promise.all([...files].map((key) => deleteReceipt(key)));
  await removeWorkspaceBackups(workspaceId);
  for (const model of workspaceModels()) {
    await model.deleteMany({ workspaceId } as never, model === (M.AuditEntry as unknown as Model<never>) ? { auditPurge: true } : {});
  }
  await M.Workspace.deleteOne({ _id: workspaceId });
}
