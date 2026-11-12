import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { LedgerUser, Notification, ReceiptInbox, Transaction, TransactionChange, TransactionComment, Workspace, WorkspaceMember } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { deleteReceipt } from "@/src/server/storage/receipts";
import { receiptKeysOf, purgeWorkspace } from "@/src/server/workspace/purge";
import { notifyUsers } from "@/src/server/notifications/notify";
import { appendAudit } from "@/src/server/audit";
import { requireSecondOwner, type SecondApproval } from "@/src/server/dual-control";
import { roleOf } from "@/src/core/permissions/can";
import { anyRule, confirmsName, cutoff, DEFAULT_RETENTION, RETENTION_LABEL, retentionProblem, type RetentionDays, type RetentionPolicy } from "@/src/core/retention";

const oid = (id: string | Types.ObjectId) => {
  if (!Types.ObjectId.isValid(String(id))) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(String(id));
};
/** Records a run takes from one workspace for each rule; the rest go the next day. */
const BATCH = 500;

type StoredPolicy = { deletedTransactionsDays?: number | null; unmatchedReceiptsDays?: number | null; notificationsDays?: number | null };

function policyOf(stored: StoredPolicy | null | undefined): RetentionPolicy {
  return {
    deletedTransactionsDays: (stored?.deletedTransactionsDays ?? null) as RetentionDays,
    unmatchedReceiptsDays: (stored?.unmatchedReceiptsDays ?? null) as RetentionDays,
    notificationsDays: (stored?.notificationsDays ?? null) as RetentionDays,
  };
}

export function getRetention(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "workspace.manage");
    const workspace = await Workspace.findById(oid(workspaceId)).select("retention kind name").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    return {
      policy: policyOf(workspace.retention),
      lastRunAt: workspace.retention?.lastRunAt ? workspace.retention.lastRunAt.toISOString() : null,
      kind: workspace.kind,
      name: workspace.name,
    };
  });
}

export function setRetention(userId: string, workspaceId: string, policy: RetentionPolicy) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "workspace.manage");
    const problem = retentionProblem(policy);
    if (problem) throw new ApiError(400, "invalid_request", problem);
    const before = policyOf((await Workspace.findById(oid(workspaceId)).select("retention").lean())?.retention);
    await Workspace.updateOne({ _id: oid(workspaceId) }, { $set: { "retention.deletedTransactionsDays": policy.deletedTransactionsDays, "retention.unmatchedReceiptsDays": policy.unmatchedReceiptsDays, "retention.notificationsDays": policy.notificationsDays } });
    const words = (Object.keys(RETENTION_LABEL) as Array<keyof RetentionPolicy>).map((k) => `${RETENTION_LABEL[k]}: ${policy[k] ? `${policy[k]} days` : "kept"}`).join("; ");
    await appendAudit({ workspaceId, actorId: userId, action: "workspace.retention_changed", entity: "workspace", entityId: workspaceId, summary: `Retention set. ${words}`, data: { before, after: policy } });
  }).then(() => getRetention(userId, workspaceId));
}

/** One workspace's retention, applied: what's past each rule's cutoff goes. */
async function applyRetention(workspaceId: Types.ObjectId, policy: RetentionPolicy, now: Date) {
  const removed = { deletedTransactions: 0, unmatchedReceipts: 0, notifications: 0 };

  const txCut = cutoff(policy.deletedTransactionsDays, now);
  if (txCut) {
    const docs = await Transaction.find({ workspaceId, deletedAt: { $ne: null, $lt: txCut } }).select("_id").limit(BATCH).lean();
    const ids = docs.map((d) => d._id);
    if (ids.length) {
      // Files no live record still uses (an inbox receipt matched to it shares its file).
      const keys = await receiptKeysOf({ _id: { $in: ids } });
      const stillUsed = new Set([...(await receiptKeysOf({ workspaceId, _id: { $nin: ids }, $or: [{ receiptStorageKey: { $in: keys } }, { "attachments.storageKey": { $in: keys } }] }))]);
      await Promise.all(keys.filter((k) => !stillUsed.has(k)).map((k) => deleteReceipt(k)));
      await Promise.all([
        TransactionChange.deleteMany({ transactionId: { $in: ids } }),
        TransactionComment.deleteMany({ transactionId: { $in: ids } }),
        ReceiptInbox.deleteMany({ transactionId: { $in: ids } }),
      ]);
      removed.deletedTransactions = (await Transaction.deleteMany({ _id: { $in: ids }, deletedAt: { $ne: null } })).deletedCount;
    }
  }

  const receiptCut = cutoff(policy.unmatchedReceiptsDays, now);
  if (receiptCut) {
    const receipts = await ReceiptInbox.find({ workspaceId, transactionId: null, createdAt: { $lt: receiptCut } }).select("storageKey").limit(BATCH).lean();
    await Promise.all(receipts.map((r) => deleteReceipt(r.storageKey)));
    removed.unmatchedReceipts = (await ReceiptInbox.deleteMany({ _id: { $in: receipts.map((r) => r._id) }, transactionId: null })).deletedCount;
  }

  const noteCut = cutoff(policy.notificationsDays, now);
  if (noteCut) removed.notifications = (await Notification.deleteMany({ workspaceId, createdAt: { $lt: noteCut } })).deletedCount;

  if (removed.deletedTransactions || removed.unmatchedReceipts || removed.notifications) {
    await appendAudit({
      workspaceId,
      actorId: null,
      action: "workspace.retention_applied",
      entity: "workspace",
      entityId: workspaceId,
      summary: `Retention removed ${removed.deletedTransactions} deleted transaction${removed.deletedTransactions === 1 ? "" : "s"}, ${removed.unmatchedReceipts} unmatched receipt${removed.unmatchedReceipts === 1 ? "" : "s"} and ${removed.notifications} notification${removed.notifications === 1 ? "" : "s"}`,
      data: removed,
    });
  }
  await Workspace.updateOne({ _id: workspaceId }, { $set: { "retention.lastRunAt": now } });
  return removed;
}

/** For the daily run: every workspace with a rule set. */
export function runRetention(now = new Date()) {
  return withDb(async () => {
    const workspaces = await Workspace.find({ retention: { $ne: null } }).select("retention").lean();
    const total = { deletedTransactions: 0, unmatchedReceipts: 0, notifications: 0 };
    for (const workspace of workspaces) {
      const policy = policyOf(workspace.retention);
      if (!anyRule(policy)) continue;
      try {
        const removed = await applyRetention(workspace._id, policy, now);
        total.deletedTransactions += removed.deletedTransactions;
        total.unmatchedReceipts += removed.unmatchedReceipts;
        total.notifications += removed.notifications;
      } catch (error) {
        console.error("Retention failed for a workspace; it will be tried on the next run.", error instanceof Error ? error.message : error);
      }
    }
    return { retentionRemoved: total };
  });
}

/** Runs the workspace's rules now, for those who run it. */
export function applyRetentionNow(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "workspace.manage");
    const workspace = await Workspace.findById(oid(workspaceId)).select("retention").lean();
    const policy = policyOf(workspace?.retention ?? DEFAULT_RETENTION);
    if (!anyRule(policy)) throw new ApiError(400, "invalid_request", "No retention rule is set");
    return applyRetention(oid(workspaceId), policy, new Date());
  });
}

/**
 * Deletes a shared workspace and everything in it, for good: only its
 * owner, typing its name. A personal workspace goes with the account.
 * Everyone who was in it is told.
 */
export function deleteWorkspace(userId: string, workspaceId: string, typedName: string, approval?: SecondApproval) {
  return withDb(async () => {
    const grant = await requireMembershipRole(userId, workspaceId);
    if (roleOf(grant) !== "owner") throw new ApiError(403, "forbidden", "Only an owner can delete the workspace");
    const workspace = await Workspace.findById(oid(workspaceId)).select("kind name").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    if (workspace.kind === "personal") throw new ApiError(400, "invalid_request", "Your personal workspace goes only with your account");
    if (!confirmsName(typedName, workspace.name)) throw new ApiError(400, "invalid_request", "Type the workspace's name exactly to delete it");
    await requireSecondOwner({ actorId: userId, workspaceId, kind: "workspace.delete", payload: { confirmName: typedName.trim() }, summary: `Delete ${workspace.name} and everything in it`, approval });
    const members = await WorkspaceMember.find({ workspaceId: workspace._id }).select("userId").lean();
    const me = await LedgerUser.findById(oid(userId)).select("displayName").lean();
    await purgeWorkspace(workspace._id);
    await notifyUsers({
      userIds: members.map((m) => String(m.userId)).filter((id) => id !== userId),
      workspaceId: null,
      kind: "workflow",
      title: `${workspace.name} was deleted`,
      body: `${me?.displayName ?? "Its owner"} deleted the workspace and everything in it.`,
      href: "/home",
    });
    return { deleted: true };
  });
}
