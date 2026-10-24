import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ReceiptInbox, Transaction as TransactionModel } from "@/src/server/models";
import type { ReceiptInboxDocument } from "@/src/server/models/ReceiptInbox";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { mapTransaction } from "@/src/server/mappers";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { deleteReceipt, receiptUrlFor, saveReceipt } from "@/src/server/storage/receipts";
import { addAttachment } from "@/src/server/transaction-activity";
import { confidentMatch, guessFromFileName, rankMatches, RECEIPT_WINDOW_DAYS, type MatchCandidate } from "@/src/core/receipts";
import type { InboxReceipt, LedgerSyncProvider } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** Files one upload can carry. */
export const MAX_RECEIPTS_PER_UPLOAD = 25;

const DAY = 86_400_000;

type Candidate = MatchCandidate & { doc: TransactionDocument };

function candidateOf(doc: TransactionDocument): Candidate {
  return {
    id: String(doc._id),
    type: doc.type,
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    date: doc.date.toISOString().slice(0, 10),
    merchant: doc.merchant ?? null,
    note: doc.note ?? null,
    hasReceipt: Boolean(doc.receiptStorageKey || doc.attachments?.length),
    doc,
  };
}

/** Transactions any of these receipts could be for: their amounts, around their dates (or the last year, for one without a date). */
async function candidatesFor(workspaceId: Types.ObjectId, receipts: ReceiptInboxDocument[]) {
  const open = receipts.filter((r) => !r.transactionId && r.amountMinor != null);
  if (!open.length) return [];
  const dates = open.map((r) => r.date);
  const undated = dates.some((d) => !d);
  const known = dates.filter((d): d is string => Boolean(d)).sort();
  const from = undated || !known.length ? new Date(Date.now() - 365 * DAY) : new Date(Date.parse(`${known[0]}T00:00:00Z`) - RECEIPT_WINDOW_DAYS * DAY);
  const to = undated || !known.length ? new Date(Date.now() + 30 * DAY) : new Date(Date.parse(`${known.at(-1)}T23:59:59Z`) + RECEIPT_WINDOW_DAYS * DAY);
  const docs = await TransactionModel.find({
    workspaceId,
    deletedAt: null,
    type: { $ne: "transfer" },
    amountMinor: { $in: [...new Set(open.map((r) => r.amountMinor!))] },
    date: { $gte: from, $lte: to },
  }).lean<TransactionDocument[]>();
  return docs.map(candidateOf);
}

function factsOf(receipt: ReceiptInboxDocument) {
  return { date: receipt.date ?? null, amountMinor: receipt.amountMinor ?? null, currency: receipt.currency ?? null, merchant: receipt.merchant ?? null };
}

function toInbox(receipt: ReceiptInboxDocument, candidates: Candidate[]): InboxReceipt {
  return {
    id: String(receipt._id),
    name: receipt.name,
    url: receiptUrlFor(receipt.storageKey),
    contentType: receipt.contentType,
    size: receipt.size,
    date: receipt.date ?? null,
    amountMinor: receipt.amountMinor ?? null,
    currency: receipt.currency ?? null,
    merchant: receipt.merchant ?? null,
    transactionId: receipt.transactionId ? String(receipt.transactionId) : null,
    matchedAt: receipt.matchedAt ? receipt.matchedAt.toISOString() : null,
    createdAt: receipt.createdAt.toISOString(),
    suggestions: receipt.transactionId ? [] : rankMatches(factsOf(receipt), candidates).slice(0, 5).map((c) => mapTransaction(c.doc)),
  };
}

/** Saves several receipt files to the inbox, reading what it can from each name. */
export function uploadReceipts(userId: string, workspaceId: string, files: Array<{ name: string; type: string; bytes: Buffer }>) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    if (!files.length) throw new ApiError(400, "invalid_request", "Choose one or more receipts");
    if (files.length > MAX_RECEIPTS_PER_UPLOAD) throw new ApiError(400, "too_many_files", `Up to ${MAX_RECEIPTS_PER_UPLOAD} receipts at a time`);
    // Check every file before saving any, so a bad one doesn't leave half an upload.
    for (const file of files) {
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) throw new ApiError(400, "invalid_request", `${file.name}: receipts must be JPEG, PNG, WebP or PDF`);
      if (file.bytes.byteLength > 8 * 1024 * 1024) throw new ApiError(400, "invalid_request", `${file.name}: receipts must be 8 MB or smaller`);
    }
    const created = [];
    for (const file of files) {
      const saved = await saveReceipt({ workspaceId, bytes: file.bytes, mime: file.type });
      const guess = guessFromFileName(file.name);
      created.push(
        await ReceiptInbox.create({
          workspaceId: oid(workspaceId),
          storageKey: saved.key,
          name: file.name.slice(0, 200) || "Receipt",
          contentType: file.type,
          size: file.bytes.byteLength,
          ...guess,
          uploadedById: oid(userId),
        }),
      );
    }
    return created.length;
  });
}

/** The inbox: receipts still to match (with suggestions), then recently matched ones. */
export function listInbox(userId: string, workspaceId: string): Promise<{ receipts: InboxReceipt[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const [open, matched] = await Promise.all([
      ReceiptInbox.find({ workspaceId: ws, transactionId: null }).sort({ createdAt: -1 }).limit(200).lean<ReceiptInboxDocument[]>(),
      ReceiptInbox.find({ workspaceId: ws, transactionId: { $ne: null } }).sort({ matchedAt: -1 }).limit(20).lean<ReceiptInboxDocument[]>(),
    ]);
    const candidates = await candidatesFor(ws, open);
    return { receipts: [...open, ...matched].map((r) => toInbox(r, candidates)) };
  });
}

async function requireReceipt(userId: string, receiptId: string) {
  const receipt = await ReceiptInbox.findById(oid(receiptId));
  if (!receipt) throw new ApiError(404, "not_found", "Receipt not found");
  await requireAction(userId, String(receipt.workspaceId), "expense.submit");
  return receipt;
}

/** Corrects what a receipt is for: its date, amount (null to clear), currency or shop. */
export function updateInboxReceipt(userId: string, receiptId: string, patch: { date?: string | null; amountMinor?: number | null; currency?: string | null; merchant?: string | null }) {
  return withDb(async () => {
    const receipt = await requireReceipt(userId, receiptId);
    if (patch.date !== undefined) receipt.date = patch.date;
    if (patch.amountMinor !== undefined) receipt.amountMinor = patch.amountMinor;
    if (patch.currency !== undefined) receipt.currency = patch.currency;
    if (patch.merchant !== undefined) receipt.merchant = patch.merchant?.trim().slice(0, 80) || null;
    await receipt.save();
  });
}

/** Removes a receipt from the inbox; one not matched yet takes its file with it. */
export function deleteInboxReceipt(userId: string, receiptId: string) {
  return withDb(async () => {
    const receipt = await requireReceipt(userId, receiptId);
    await receipt.deleteOne();
    if (!receipt.transactionId) await deleteReceipt(receipt.storageKey);
  });
}

/**
 * Attaches a receipt to a transaction in its workspace: as the receipt if it
 * has none, otherwise as one more file.
 */
export async function matchReceipt(sync: LedgerSyncProvider, userId: string, receiptId: string, transactionId: string) {
  const { receipt, txn } = await withDb(async () => {
    const receipt = await requireReceipt(userId, receiptId);
    if (receipt.transactionId) throw new ApiError(409, "already_matched", "That receipt is already matched");
    const txn = await TransactionModel.findOne({ _id: oid(transactionId), workspaceId: receipt.workspaceId, deletedAt: null }).select("receiptStorageKey type date amountMinor currency merchant").lean();
    if (!txn) throw new ApiError(404, "not_found", "Transaction not found");
    return { receipt, txn };
  });
  if (!txn.receiptStorageKey) await sync.updateTransaction(transactionId, { receiptStorageKey: receipt.storageKey });
  else await addAttachment(userId, transactionId, { storageKey: receipt.storageKey, name: receipt.name, contentType: receipt.contentType, size: receipt.size });
  // The receipt now says what its transaction does, for whatever it was missing.
  await withDb(() =>
    ReceiptInbox.updateOne(
      { _id: receipt._id },
      {
        transactionId: oid(transactionId),
        matchedAt: new Date(),
        date: receipt.date ?? txn.date.toISOString().slice(0, 10),
        amountMinor: receipt.amountMinor ?? txn.amountMinor,
        currency: receipt.currency ?? txn.currency,
        merchant: receipt.merchant ?? txn.merchant ?? null,
      },
    ),
  );
}

/** Matches every receipt whose transaction stands out (see confidentMatch); the rest stay for a person to pick. */
export async function matchAll(sync: LedgerSyncProvider, userId: string, workspaceId: string) {
  const pairs = await withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    const ws = oid(workspaceId);
    const open = await ReceiptInbox.find({ workspaceId: ws, transactionId: null }).lean<ReceiptInboxDocument[]>();
    const candidates = await candidatesFor(ws, open);
    const taken = new Set<string>();
    const found: Array<{ receiptId: string; transactionId: string }> = [];
    for (const receipt of open) {
      const pick = confidentMatch(factsOf(receipt), candidates.filter((c) => !taken.has(c.id)));
      if (!pick) continue;
      taken.add(pick.id);
      found.push({ receiptId: String(receipt._id), transactionId: pick.id });
    }
    return found;
  });
  let matched = 0;
  for (const pair of pairs) {
    await matchReceipt(sync, userId, pair.receiptId, pair.transactionId);
    matched++;
  }
  return { matched };
}
