import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { LedgerUser, Transaction as TransactionModel, TransactionChange, TransactionComment } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { receiptUrlFor, receiptWorkspaceId } from "@/src/server/storage/receipt-keys";
import { can } from "@/src/core/permissions/can";
import { MAX_ATTACHMENTS, type FieldChange, type HistoryAction } from "@/src/core/history";
import type { TransactionActivity } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** Adds an entry to a transaction's history. */
export async function recordChange(input: {
  workspaceId: Types.ObjectId;
  transactionId: Types.ObjectId;
  actorId: string;
  action: HistoryAction;
  changes?: FieldChange[];
  detail?: string | null;
}) {
  await TransactionChange.create({
    workspaceId: input.workspaceId,
    transactionId: input.transactionId,
    actorId: new Types.ObjectId(input.actorId),
    action: input.action,
    changes: input.changes ?? [],
    detail: input.detail ?? null,
  });
}

/** The transaction, if the person is in its workspace; and whether they may change it (its creator, or the owner). */
async function requireTransaction(userId: string, transactionId: string, { includeDeleted = false } = {}) {
  const doc = await TransactionModel.findOne({ _id: oid(transactionId), ...(includeDeleted ? {} : { deletedAt: null }) });
  if (!doc) throw new ApiError(404, "not_found", "Transaction not found");
  const role = await requireMembershipRole(userId, String(doc.workspaceId));
  const canEdit = String(doc.createdById) === userId || can(role, "workspace.manage");
  return { doc, role, canEdit };
}

/** Attaches an uploaded file (from the workspace's receipt upload) to a transaction. */
export function addAttachment(userId: string, transactionId: string, input: { storageKey: string; name: string; contentType: string; size: number }) {
  return withDb(async () => {
    const { doc, canEdit } = await requireTransaction(userId, transactionId);
    if (!canEdit) throw new ApiError(403, "forbidden", "You can only add files to transactions you added");
    if (receiptWorkspaceId(input.storageKey) !== String(doc.workspaceId)) throw new ApiError(400, "invalid_request", "That file isn't in this workspace");
    if ((doc.attachments?.length ?? 0) >= MAX_ATTACHMENTS) throw new ApiError(400, "limit_reached", `A transaction can have up to ${MAX_ATTACHMENTS} files`);
    doc.attachments.push({ storageKey: input.storageKey, name: input.name.trim().slice(0, 120) || "File", contentType: input.contentType, size: input.size, uploadedById: oid(userId), uploadedAt: new Date() });
    await doc.save();
    await recordChange({ workspaceId: doc.workspaceId, transactionId: doc._id, actorId: userId, action: "attachment_added", detail: input.name });
  });
}

export function removeAttachment(userId: string, transactionId: string, attachmentId: string) {
  return withDb(async () => {
    const { doc, canEdit } = await requireTransaction(userId, transactionId);
    if (!canEdit) throw new ApiError(403, "forbidden", "You can only remove files from transactions you added");
    const attachment = doc.attachments.find((a) => String(a._id) === attachmentId);
    if (!attachment) throw new ApiError(404, "not_found", "File not found");
    doc.attachments.pull({ _id: attachment._id });
    await doc.save();
    await recordChange({ workspaceId: doc.workspaceId, transactionId: doc._id, actorId: userId, action: "attachment_removed", detail: attachment.name });
  });
}

export function addComment(userId: string, transactionId: string, body: string) {
  return withDb(async () => {
    const { doc } = await requireTransaction(userId, transactionId);
    await TransactionComment.create({ workspaceId: doc.workspaceId, transactionId: doc._id, authorId: oid(userId), body: body.trim() });
  });
}

/** A comment goes by its author's hand, or the owner's. */
export function deleteComment(userId: string, commentId: string) {
  return withDb(async () => {
    const comment = await TransactionComment.findOne({ _id: oid(commentId), deletedAt: null });
    if (!comment) throw new ApiError(404, "not_found", "Comment not found");
    const role = await requireMembershipRole(userId, String(comment.workspaceId));
    if (String(comment.authorId) !== userId && !can(role, "workspace.manage")) throw new ApiError(403, "forbidden", "You can only delete your own comments");
    comment.deletedAt = new Date();
    await comment.save();
  });
}

/** A transaction's files, comments and history, newest first, with names for the people involved. */
export function getActivity(userId: string, transactionId: string): Promise<TransactionActivity> {
  return withDb(async () => {
    const { doc, role, canEdit } = await requireTransaction(userId, transactionId, { includeDeleted: true });
    const [comments, changes] = await Promise.all([
      TransactionComment.find({ transactionId: doc._id, deletedAt: null }).sort({ createdAt: -1 }).limit(200).lean(),
      TransactionChange.find({ transactionId: doc._id }).sort({ createdAt: -1, _id: -1 }).limit(200).lean(),
    ]);
    const people = await LedgerUser.find({ _id: { $in: [...comments.map((c) => c.authorId), ...changes.map((c) => c.actorId)] } }).select("displayName").lean();
    const nameOf = new Map(people.map((p) => [String(p._id), p.displayName]));
    return {
      canEdit,
      attachments: (doc.attachments ?? []).map((a) => ({
        id: String(a._id),
        name: a.name,
        contentType: a.contentType,
        size: a.size,
        url: receiptUrlFor(a.storageKey),
        uploadedAt: a.uploadedAt.toISOString(),
      })),
      comments: comments.map((c) => ({
        id: String(c._id),
        body: c.body,
        authorName: nameOf.get(String(c.authorId)) ?? "Someone",
        createdAt: c.createdAt.toISOString(),
        canDelete: String(c.authorId) === userId || can(role, "workspace.manage"),
      })),
      history: changes.map((c) => ({
        id: String(c._id),
        action: c.action as HistoryAction,
        changes: (c.changes ?? []) as FieldChange[],
        detail: c.detail ?? null,
        actorName: nameOf.get(String(c.actorId)) ?? "Someone",
        createdAt: c.createdAt.toISOString(),
      })),
    };
  });
}
