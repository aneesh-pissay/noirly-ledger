import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel, Category, LoanPlan, Transaction as TransactionModel } from "@/src/server/models";
import type { LoanPlanDocument } from "@/src/server/models/LoanPlan";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { checkLoan, loanSchedule, loanStatus, type LoanView } from "@/src/core/loans";
import type { LedgerSyncProvider } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** The loan's EMIs from its terms (named one by one: a live document doesn't spread into an object). */
function scheduleOf(doc: Pick<LoanPlanDocument, "principalMinor" | "months" | "annualRatePct" | "firstDate">) {
  return loanSchedule({ principalMinor: doc.principalMinor, months: doc.months, annualRatePct: doc.annualRatePct, firstDate: doc.firstDate });
}

function view(doc: LoanPlanDocument, asOf: string): LoanView {
  const { rows, summary } = loanStatus(scheduleOf(doc), doc.payments?.length ?? 0, asOf);
  return {
    id: String(doc._id),
    name: doc.name,
    loanAccountId: String(doc.loanAccountId),
    payFromAccountId: String(doc.payFromAccountId),
    categoryId: doc.categoryId ? String(doc.categoryId) : null,
    principalMinor: doc.principalMinor,
    annualRatePct: doc.annualRatePct,
    months: doc.months,
    firstDate: doc.firstDate,
    currency: doc.currency,
    summary,
    rows,
  };
}

export function listLoans(userId: string, workspaceId: string): Promise<{ loans: LoanView[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await LoanPlan.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: 1 }).lean<LoanPlanDocument[]>();
    return { loans: docs.map((d) => view(d, today())) };
  });
}

export type LoanInput = {
  name: string;
  loanAccountId: string;
  payFromAccountId: string;
  categoryId: string | null;
  principalMinor: number;
  annualRatePct: number;
  months: number;
  firstDate: string;
};

export function createLoan(userId: string, workspaceId: string, input: LoanInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    const check = checkLoan(input);
    if (!check.ok) throw new ApiError(400, "invalid_request", check.error);
    const ws = oid(workspaceId);
    const [loan, from] = await Promise.all([
      AccountModel.findOne({ _id: oid(input.loanAccountId), workspaceId: ws, archivedAt: null }).lean(),
      AccountModel.findOne({ _id: oid(input.payFromAccountId), workspaceId: ws, archivedAt: null }).lean(),
    ]);
    if (!loan || loan.kind !== "loan") throw new ApiError(400, "invalid_request", "Pick the loan's account (a loan account)");
    if (!from || from.kind === "loan") throw new ApiError(400, "invalid_request", "Pick the account the EMIs are paid from");
    if (from.currency !== loan.currency) throw new ApiError(400, "invalid_request", "The loan and the account paying it need the same currency");
    if (await LoanPlan.exists({ loanAccountId: loan._id })) throw new ApiError(409, "already_exists", "That loan account already has a repayment schedule");
    if (input.categoryId && !(await Category.exists({ _id: oid(input.categoryId), workspaceId: ws }))) throw new ApiError(400, "invalid_request", "That category isn't in this workspace");
    const doc = await LoanPlan.create({
      workspaceId: ws,
      name: input.name.trim(),
      loanAccountId: loan._id,
      payFromAccountId: from._id,
      categoryId: input.categoryId ? oid(input.categoryId) : null,
      principalMinor: input.principalMinor,
      annualRatePct: input.annualRatePct,
      months: input.months,
      firstDate: input.firstDate,
      currency: loan.currency,
      createdById: oid(userId),
    });
    return view(doc.toObject() as LoanPlanDocument, today());
  });
}

async function requireLoan(userId: string, planId: string) {
  const doc = await LoanPlan.findById(oid(planId));
  if (!doc) throw new ApiError(404, "not_found", "Loan not found");
  await requireAction(userId, String(doc.workspaceId), "expense.submit");
  return doc;
}

/**
 * Records the next EMI as paid, on `date` (its due date if left out): the
 * principal moves from the paying account to the loan's (what's owed goes
 * down) and the interest is spending from the paying account.
 */
export async function recordEmi(sync: LedgerSyncProvider, userId: string, planId: string, date?: string | null) {
  const doc = await withDb(() => requireLoan(userId, planId));
  const rows = scheduleOf(doc);
  const paid = doc.payments?.length ?? 0;
  const row = rows[paid];
  if (!row) throw new ApiError(409, "paid_off", "Every EMI is recorded already");
  const on = date ?? row.date;
  if (on > today()) throw new ApiError(400, "invalid_request", "An EMI can't be recorded ahead of the day it's paid");
  const label = `${doc.name} · EMI ${row.number}/${doc.months}`;
  const transfer = await sync.createTransaction({
    workspaceId: String(doc.workspaceId),
    type: "transfer",
    amountMinor: row.principalMinor,
    currency: doc.currency,
    accountId: String(doc.payFromAccountId),
    toAccountId: String(doc.loanAccountId),
    toAmountMinor: row.principalMinor,
    date: on,
    note: `${label} principal`,
  });
  let interestId: string | null = null;
  try {
    if (row.interestMinor > 0) {
      const interest = await sync.createTransaction({
        workspaceId: String(doc.workspaceId),
        type: "expense",
        amountMinor: row.interestMinor,
        currency: doc.currency,
        accountId: String(doc.payFromAccountId),
        categoryId: doc.categoryId ? String(doc.categoryId) : null,
        date: on,
        note: `${label} interest`,
      });
      interestId = interest.id;
    }
  } catch (error) {
    await sync.deleteTransaction(transfer.id);
    throw error;
  }
  return withDb(async () => {
    // Recorded once: a second click finds the count moved on and takes its own back out.
    const updated = await LoanPlan.findOneAndUpdate(
      { _id: doc._id, payments: { $size: paid } },
      { $push: { payments: { number: row.number, date: on, transferId: oid(transfer.id), interestId: interestId ? oid(interestId) : null } } },
      { new: true },
    ).lean<LoanPlanDocument>();
    if (!updated) {
      await sync.deleteTransaction(transfer.id);
      if (interestId) await sync.deleteTransaction(interestId);
      throw new ApiError(409, "conflict", "That EMI was just recorded");
    }
    return view(updated, today());
  });
}

/** Takes back the last EMI recorded, with its transactions. */
export async function undoLastEmi(sync: LedgerSyncProvider, userId: string, planId: string) {
  const doc = await withDb(() => requireLoan(userId, planId));
  const last = doc.payments?.at(-1);
  if (!last) throw new ApiError(409, "nothing_recorded", "No EMI is recorded yet");
  for (const id of [last.transferId, last.interestId]) {
    if (id && (await withDb(() => TransactionModel.exists({ _id: id, deletedAt: null })))) await sync.deleteTransaction(String(id));
  }
  return withDb(async () => {
    const updated = await LoanPlan.findByIdAndUpdate(doc._id, { $pop: { payments: 1 } }, { new: true }).lean<LoanPlanDocument>();
    return view(updated!, today());
  });
}

/** Removes the schedule; EMIs already recorded stay as transactions. */
export function deleteLoan(userId: string, planId: string) {
  return withDb(async () => {
    const doc = await requireLoan(userId, planId);
    await doc.deleteOne();
  });
}

/** EMIs not recorded yet, due by `through` (overdue ones too): for the bill calendar and the projection. */
export async function unpaidEmis(workspaceId: Types.ObjectId, through: string) {
  const docs = await LoanPlan.find({ workspaceId }).lean<LoanPlanDocument[]>();
  return docs.flatMap((doc) =>
    scheduleOf(doc)
      .slice(doc.payments?.length ?? 0)
      .filter((row) => row.date <= through)
      .map((row) => ({ plan: doc, row })),
  );
}

/** EMIs recorded as paid whose due date falls from `from` through `through`, with the transfer each made. */
export async function paidEmis(workspaceId: Types.ObjectId, from: string, through: string) {
  const docs = await LoanPlan.find({ workspaceId }).lean<LoanPlanDocument[]>();
  return docs.flatMap((doc) => {
    const rows = scheduleOf(doc);
    return (doc.payments ?? []).flatMap((payment) => {
      const row = rows[payment.number - 1];
      return row && row.date >= from && row.date <= through ? [{ plan: doc, row, transferId: payment.transferId ? String(payment.transferId) : null }] : [];
    });
  });
}
