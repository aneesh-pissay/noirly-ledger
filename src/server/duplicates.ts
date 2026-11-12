import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Transaction as TransactionModel } from "@/src/server/models";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { mapTransaction } from "@/src/server/mappers";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { can } from "@/src/core/permissions/can";
import { DUPLICATE_WINDOW_DAYS, duplicatePairs, duplicateReason, type DuplicateCandidate, type DuplicateReason } from "@/src/core/duplicates";
import type { Transaction } from "@/src/core/sync/types";
import type { TransactionType } from "@/src/core/models/enums";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

const DAY = 86_400_000;

type Lean = Pick<TransactionDocument, "type" | "amountMinor" | "currency" | "date" | "accountId" | "note" | "merchant" | "upiRef"> & { _id: Types.ObjectId; notDuplicateOf?: Types.ObjectId[] | null };

export function candidateOf(doc: Lean): DuplicateCandidate & { id: string } {
  return {
    id: String(doc._id),
    type: doc.type,
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    date: doc.date.toISOString().slice(0, 10),
    accountId: doc.accountId ? String(doc.accountId) : null,
    text: [doc.merchant, doc.note].filter(Boolean).join(" "),
    upiRef: doc.upiRef ?? null,
  };
}

/** Live transactions near a date that could be another record of the same payments: same kind and amount, or a UPI reference given. */
export async function nearbyTransactions(
  workspaceId: Types.ObjectId,
  input: { from: string; to: string; amounts?: Array<{ type: TransactionType; amountMinor: number }>; upiRefs?: string[]; exceptId?: string },
) {
  const window = {
    date: {
      $gte: new Date(Date.parse(`${input.from}T00:00:00.000Z`) - DUPLICATE_WINDOW_DAYS * DAY),
      $lte: new Date(Date.parse(`${input.to}T23:59:59.999Z`) + DUPLICATE_WINDOW_DAYS * DAY),
    },
  };
  return TransactionModel.find({
    workspaceId,
    deletedAt: null,
    ...(input.exceptId ? { _id: { $ne: oid(input.exceptId) } } : {}),
    $or: [
      input.amounts ? { ...window, $or: input.amounts.map((a) => ({ type: a.type, amountMinor: a.amountMinor })) } : window,
      ...(input.upiRefs?.length ? [{ upiRef: { $in: input.upiRefs } }] : []),
    ],
  }).lean<Array<TransactionDocument & { notDuplicateOf?: Types.ObjectId[] | null }>>();
}

/** Transactions already recorded that the one being entered looks like, closest first (at most five). Saves nothing. */
export function checkDuplicates(
  userId: string,
  workspaceId: string,
  input: Omit<DuplicateCandidate, "id" | "type"> & { type: TransactionType; exceptId?: string | null },
): Promise<{ matches: Array<{ transaction: Transaction; reason: DuplicateReason }> }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await nearbyTransactions(oid(workspaceId), {
      from: input.date,
      to: input.date,
      amounts: [{ type: input.type, amountMinor: input.amountMinor }],
      upiRefs: input.upiRef ? [input.upiRef] : [],
      exceptId: input.exceptId ?? undefined,
    });
    const matches = docs
      .map((doc) => ({ doc, reason: duplicateReason(input, candidateOf(doc)) }))
      .filter((m): m is { doc: (typeof docs)[number]; reason: DuplicateReason } => m.reason != null)
      .sort((a, b) => Math.abs(a.doc.date.getTime() - Date.parse(input.date)) - Math.abs(b.doc.date.getTime() - Date.parse(input.date)))
      .slice(0, 5);
    return { matches: matches.map((m) => ({ transaction: mapTransaction(m.doc as TransactionDocument), reason: m.reason })) };
  });
}

/** How far back the review looks, in days. */
export const DUPLICATE_REVIEW_DAYS = 120;

/** Pairs in the workspace's recent transactions that look like one payment recorded twice, unless someone said they're not. */
export function listDuplicates(userId: string, workspaceId: string): Promise<{ pairs: Array<{ first: Transaction; second: Transaction; reason: DuplicateReason }> }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await TransactionModel.find({ workspaceId: oid(workspaceId), deletedAt: null, isPosted: true, date: { $gte: new Date(Date.now() - DUPLICATE_REVIEW_DAYS * DAY) } })
      .sort({ date: -1 })
      .limit(5000)
      .lean<Array<TransactionDocument & { notDuplicateOf?: Types.ObjectId[] | null }>>();
    const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
    const dismissed = (a: string, b: string) =>
      Boolean(byId.get(a)?.notDuplicateOf?.some((id) => String(id) === b) || byId.get(b)?.notDuplicateOf?.some((id) => String(id) === a));
    const pairs = duplicatePairs(docs.map(candidateOf), dismissed).slice(0, 50);
    return {
      pairs: pairs.map((p) => ({ first: mapTransaction(byId.get(p.first.id) as TransactionDocument), second: mapTransaction(byId.get(p.second.id) as TransactionDocument), reason: p.reason })),
    };
  });
}

/** Marks two transactions as separate payments, so the review stops pairing them. */
export function dismissDuplicate(userId: string, transactionId: string, otherId: string) {
  return withDb(async () => {
    if (transactionId === otherId) throw new ApiError(400, "invalid_request", "Pick two different transactions");
    const [a, b] = await Promise.all([oid(transactionId), oid(otherId)].map((id) => TransactionModel.findOne({ _id: id, deletedAt: null }).select("workspaceId").lean()));
    if (!a || !b || String(a.workspaceId) !== String(b.workspaceId)) throw new ApiError(404, "not_found", "Transaction not found");
    const role = await requireMembershipRole(userId, String(a.workspaceId));
    if (!can(role, "expense.submit")) throw new ApiError(403, "forbidden", "You can't change transactions here");
    await TransactionModel.updateOne({ _id: a._id }, { $addToSet: { notDuplicateOf: b._id } });
    await TransactionModel.updateOne({ _id: b._id }, { $addToSet: { notDuplicateOf: a._id } });
  });
}
