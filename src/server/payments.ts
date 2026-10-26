import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel, ScheduledPayment, Transaction as TransactionModel } from "@/src/server/models";
import type { ScheduledPaymentDocument } from "@/src/server/models/ScheduledPayment";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { mapTransaction } from "@/src/server/mappers";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { nextDueDate, paymentStatus, type PaymentRepeat, type PaymentView } from "@/src/core/payments";
import { rankMatches, RECEIPT_WINDOW_DAYS } from "@/src/core/receipts";
import { normalizeUpiId } from "@/src/core/upi";
import type { LedgerSyncProvider, Transaction } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

const DAY = 86_400_000;


export type PaymentInput = {
  name: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
  accountId: string | null;
  categoryId: string | null;
  note: string | null;
  upiId?: string | null;
  payeeName?: string | null;
  repeat: PaymentRepeat;
};

/** A UPI ID as stored, or a 400 saying what's wrong with it. */
function upiIdOf(text: string | null | undefined) {
  try {
    return normalizeUpiId(text);
  } catch (error) {
    throw new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Invalid UPI ID");
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function toView(doc: ScheduledPaymentDocument, asOf = today()): PaymentView {
  return {
    id: String(doc._id),
    name: doc.name,
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    dueDate: doc.dueDate,
    accountId: doc.accountId ? String(doc.accountId) : null,
    categoryId: doc.categoryId ? String(doc.categoryId) : null,
    note: doc.note ?? null,
    upiId: doc.upiId ?? null,
    payeeName: doc.payeeName ?? null,
    repeat: (doc.repeat ?? "none") as PaymentRepeat,
    status: paymentStatus(doc.dueDate, asOf, Boolean(doc.paidOn)),
    paidOn: doc.paidOn ?? null,
    paidAmountMinor: doc.paidAmountMinor ?? null,
    transactionId: doc.transactionId ? String(doc.transactionId) : null,
    recordedHere: Boolean(doc.recordedHere),
  };
}

/** The account's currency when one is chosen (a payment from it is in its currency), else the one given. */
async function currencyFor(workspaceId: Types.ObjectId, accountId: string | null, currency: string) {
  if (!accountId) return currency.toUpperCase();
  const account = await AccountModel.findOne({ _id: oid(accountId), workspaceId }).select("currency").lean();
  if (!account) throw new ApiError(400, "invalid_request", "That account isn't in this workspace");
  return account.currency;
}

/** Payments not paid yet (overdue first, then by due date), and the most recently paid. */
export function listPayments(userId: string, workspaceId: string): Promise<{ payments: PaymentView[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const [open, paid] = await Promise.all([
      ScheduledPayment.find({ workspaceId: ws, paidOn: null }).sort({ dueDate: 1 }).limit(200).lean<ScheduledPaymentDocument[]>(),
      ScheduledPayment.find({ workspaceId: ws, paidOn: { $ne: null } }).sort({ paidOn: -1, updatedAt: -1 }).limit(20).lean<ScheduledPaymentDocument[]>(),
    ]);
    return { payments: [...open, ...paid].map((doc) => toView(doc)) };
  });
}

export function createPayment(userId: string, workspaceId: string, input: PaymentInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    const ws = oid(workspaceId);
    const doc = await ScheduledPayment.create({
      workspaceId: ws,
      ...input,
      name: input.name.trim(),
      upiId: upiIdOf(input.upiId),
      payeeName: input.payeeName?.trim() || null,
      currency: await currencyFor(ws, input.accountId, input.currency),
      accountId: input.accountId ? oid(input.accountId) : null,
      categoryId: input.categoryId ? oid(input.categoryId) : null,
      dayOfMonth: Number(input.dueDate.slice(8)),
      createdById: oid(userId),
    });
    return toView(doc.toObject() as ScheduledPaymentDocument);
  });
}

async function requirePayment(userId: string, paymentId: string) {
  const doc = await ScheduledPayment.findById(oid(paymentId));
  if (!doc) throw new ApiError(404, "not_found", "Payment not found");
  await requireAction(userId, String(doc.workspaceId), "expense.submit");
  return doc;
}

/** Changes a payment not yet paid. */
export function updatePayment(userId: string, paymentId: string, patch: Partial<PaymentInput>) {
  return withDb(async () => {
    const doc = await requirePayment(userId, paymentId);
    if (doc.paidOn) throw new ApiError(409, "already_paid", "Undo the payment first to change it");
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.amountMinor !== undefined) doc.amountMinor = patch.amountMinor;
    if (patch.dueDate !== undefined) {
      doc.dueDate = patch.dueDate;
      doc.dayOfMonth = Number(patch.dueDate.slice(8));
    }
    if (patch.accountId !== undefined) doc.accountId = patch.accountId ? oid(patch.accountId) : null;
    if (patch.accountId !== undefined || patch.currency !== undefined) doc.currency = await currencyFor(doc.workspaceId, doc.accountId ? String(doc.accountId) : null, patch.currency ?? doc.currency);
    if (patch.categoryId !== undefined) doc.categoryId = patch.categoryId ? oid(patch.categoryId) : null;
    if (patch.note !== undefined) doc.note = patch.note;
    if (patch.upiId !== undefined) doc.upiId = upiIdOf(patch.upiId);
    if (patch.payeeName !== undefined) doc.payeeName = patch.payeeName?.trim() || null;
    if (patch.repeat !== undefined) doc.repeat = patch.repeat;
    await doc.save();
    return toView(doc.toObject() as ScheduledPaymentDocument);
  });
}

/** Deletes a payment; a paid one keeps the expense it was paid with. */
export function deletePayment(userId: string, paymentId: string) {
  return withDb(async () => {
    const doc = await requirePayment(userId, paymentId);
    await doc.deleteOne();
  });
}

/** Expenses already recorded that could be this payment: its amount, within a few days of its due date, not paying another. */
export function paymentMatches(userId: string, paymentId: string): Promise<{ matches: Transaction[] }> {
  return withDb(async () => {
    const doc = await requirePayment(userId, paymentId);
    const taken = (await ScheduledPayment.find({ workspaceId: doc.workspaceId, transactionId: { $ne: null } }).select("transactionId").lean()).map((p) => String(p.transactionId));
    const due = Date.parse(`${doc.dueDate}T00:00:00Z`);
    const docs = await TransactionModel.find({
      workspaceId: doc.workspaceId,
      deletedAt: null,
      type: "expense",
      amountMinor: doc.amountMinor,
      date: { $gte: new Date(due - RECEIPT_WINDOW_DAYS * DAY), $lte: new Date(due + (RECEIPT_WINDOW_DAYS + 1) * DAY) },
    }).lean<TransactionDocument[]>();
    const candidates = docs
      .filter((t) => !taken.includes(String(t._id)))
      .map((t) => ({ id: String(t._id), type: t.type, amountMinor: t.amountMinor, currency: t.currency, date: t.date.toISOString().slice(0, 10), merchant: t.merchant ?? null, note: t.note ?? null, hasReceipt: false, doc: t }));
    const ranked = rankMatches({ date: doc.dueDate, amountMinor: doc.amountMinor, currency: doc.currency, merchant: doc.name }, candidates);
    return { matches: ranked.slice(0, 5).map((c) => mapTransaction(c.doc)) };
  });
}

export type PayInput =
  | { how: "record"; paidOn: string; amountMinor?: number | null; accountId?: string | null; upiRef?: string | null }
  | { how: "link"; transactionId: string }
  | { how: "mark"; paidOn: string };

/**
 * Marks a payment paid: recording the expense, linking one already there,
 * or just noting the day (paid from somewhere not tracked here). A
 * repeating one then gets its next payment.
 */
export async function payPayment(sync: LedgerSyncProvider, userId: string, paymentId: string, input: PayInput): Promise<{ payment: PaymentView; next: PaymentView | null }> {
  const doc = await withDb(async () => {
    const doc = await requirePayment(userId, paymentId);
    if (doc.paidOn) throw new ApiError(409, "already_paid", "That payment is already marked paid");
    return doc;
  });

  let paid: { paidOn: string; paidAmountMinor: number; transactionId: Types.ObjectId | null; recordedHere: boolean };
  if (input.how === "record") {
    const accountId = input.accountId === undefined ? (doc.accountId ? String(doc.accountId) : null) : input.accountId;
    const currency = await withDb(() => currencyFor(doc.workspaceId, accountId, doc.currency));
    const amountMinor = input.amountMinor ?? doc.amountMinor;
    const txn = await sync.createTransaction({
      workspaceId: String(doc.workspaceId),
      type: "expense",
      amountMinor,
      currency,
      accountId,
      categoryId: doc.categoryId ? String(doc.categoryId) : null,
      merchant: doc.name,
      note: doc.note,
      date: input.paidOn,
      // Paid over UPI: the reference from the app, and who it went to.
      ...(input.upiRef ? { upiRef: input.upiRef, upiId: doc.upiId ?? null } : {}),
    });
    paid = { paidOn: input.paidOn, paidAmountMinor: amountMinor, transactionId: oid(txn.id), recordedHere: true };
  } else if (input.how === "link") {
    const txn = await withDb(async () => {
      const txn = await TransactionModel.findOne({ _id: oid(input.transactionId), workspaceId: doc.workspaceId, deletedAt: null, type: "expense" }).lean();
      if (!txn) throw new ApiError(404, "not_found", "Expense not found");
      if (await ScheduledPayment.exists({ transactionId: txn._id })) throw new ApiError(409, "already_linked", "That expense already pays another bill");
      return txn;
    });
    paid = { paidOn: txn.date.toISOString().slice(0, 10), paidAmountMinor: txn.amountMinor, transactionId: txn._id, recordedHere: false };
  } else {
    paid = { paidOn: input.paidOn, paidAmountMinor: doc.amountMinor, transactionId: null, recordedHere: false };
  }

  return withDb(async () => {
    // Only the first to mark it paid wins; a second click doesn't make a second next payment.
    const updated = await ScheduledPayment.findOneAndUpdate({ _id: doc._id, paidOn: null }, { $set: paid }, { new: true }).lean<ScheduledPaymentDocument>();
    if (!updated) throw new ApiError(409, "already_paid", "That payment is already marked paid");
    const dueDate = nextDueDate(doc.dueDate, (doc.repeat ?? "none") as PaymentRepeat, doc.dayOfMonth);
    const next = dueDate
      ? await ScheduledPayment.create({
          workspaceId: doc.workspaceId,
          name: doc.name,
          amountMinor: doc.amountMinor,
          currency: doc.currency,
          dueDate,
          accountId: doc.accountId,
          categoryId: doc.categoryId,
          note: doc.note,
          upiId: doc.upiId,
          payeeName: doc.payeeName,
          repeat: doc.repeat,
          dayOfMonth: doc.dayOfMonth,
          previousId: doc._id,
          createdById: doc.createdById,
        })
      : null;
    return { payment: toView(updated), next: next ? toView(next.toObject() as ScheduledPaymentDocument) : null };
  });
}

/**
 * Takes back marking a payment paid: the expense recorded for it goes, and
 * the next one it made goes too unless that one is paid already.
 */
export async function undoPayment(sync: LedgerSyncProvider, userId: string, paymentId: string) {
  const doc = await withDb(async () => {
    const doc = await requirePayment(userId, paymentId);
    if (!doc.paidOn) throw new ApiError(409, "not_paid", "That payment isn't marked paid");
    return doc;
  });
  if (doc.recordedHere && doc.transactionId) {
    const live = await withDb(() => TransactionModel.exists({ _id: doc.transactionId, deletedAt: null }));
    if (live) await sync.deleteTransaction(String(doc.transactionId));
  }
  return withDb(async () => {
    await ScheduledPayment.deleteOne({ previousId: doc._id, paidOn: null });
    const updated = await ScheduledPayment.findByIdAndUpdate(doc._id, { $set: { paidOn: null, paidAmountMinor: null, transactionId: null, recordedHere: false } }, { new: true }).lean<ScheduledPaymentDocument>();
    return toView(updated!);
  });
}
