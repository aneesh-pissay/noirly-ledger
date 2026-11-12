import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { LedgerUser, Payout, Reimbursement, Transaction } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { memberGrants } from "@/src/server/approval-rules";
import { expenseSummary, recordApprovalEvent } from "@/src/server/approval-history";
import { notifyUsers } from "@/src/server/notifications/notify";
import { can } from "@/src/core/permissions/can";
import { formatMoney } from "@/src/core/locale-format";
import { isoDate } from "@/src/core/budgets/period";
import { payoutProblem, statusAfter, type PayoutMethod, type PayoutView, type ReimbursementStatus, type ReimbursementView } from "@/src/core/reimbursements";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** Asks to be paid back for an expense just submitted. */
export async function openReimbursement(input: {
  workspaceId: Types.ObjectId;
  transactionId: Types.ObjectId;
  approvalId: Types.ObjectId;
  claimantId: string;
  amountMinor: number;
  currency: string;
}) {
  await Reimbursement.create({ ...input, claimantId: oid(input.claimantId), status: "pending" });
}

/** Moves an expense's reimbursement on when the expense is decided or withdrawn (if it asked for one). */
export async function settleReimbursement(approvalId: Types.ObjectId, event: "approved" | "rejected" | "withdrawn") {
  await Reimbursement.updateOne({ approvalId, status: "pending" }, { $set: { status: statusAfter(event) } });
}

async function namesOf(ids: string[]) {
  const users = await LedgerUser.find({ _id: { $in: [...new Set(ids)].map(oid) } }).select("displayName").lean();
  return new Map(users.map((u) => [String(u._id), u.displayName]));
}

/**
 * Reimbursements and payouts. Those who can pay back see everyone's;
 * everyone else sees only their own.
 */
export function listReimbursements(userId: string, workspaceId: string, query: { status?: ReimbursementStatus } = {}) {
  return withDb(async () => {
    const grant = await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const canPay = can(grant, "reimbursement.pay");
    const mine = canPay ? {} : { claimantId: oid(userId) };
    const [docs, payouts] = await Promise.all([
      Reimbursement.find({ workspaceId: ws, ...mine, ...(query.status ? { status: query.status } : {}) }).sort({ createdAt: -1 }).limit(500).lean(),
      Payout.find({ workspaceId: ws, ...mine }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    const txns = new Map((await Transaction.find({ _id: { $in: docs.map((d) => d.transactionId) } }).select("note date amountMinor currency").lean()).map((t) => [String(t._id), t]));
    const names = await namesOf([...docs.map((d) => String(d.claimantId)), ...payouts.flatMap((p) => [String(p.claimantId), String(p.paidById)])]);
    const paidOn = new Map(payouts.map((p) => [String(p._id), p.paidOn]));
    const reimbursements: ReimbursementView[] = docs.map((d) => {
      const t = txns.get(String(d.transactionId));
      return {
        id: String(d._id),
        transactionId: String(d.transactionId),
        approvalId: String(d.approvalId),
        claimantId: String(d.claimantId),
        claimantName: names.get(String(d.claimantId)) ?? "Unknown",
        status: d.status as ReimbursementStatus,
        amountMinor: d.amountMinor,
        currency: d.currency,
        spentMinor: t?.amountMinor ?? d.amountMinor,
        spentCurrency: t?.currency ?? d.currency,
        note: t?.note ?? null,
        date: t?.date ? isoDate(t.date) : isoDate(d.createdAt as Date),
        payoutId: d.payoutId ? String(d.payoutId) : null,
        paidOn: d.payoutId ? paidOn.get(String(d.payoutId)) ?? null : null,
      };
    });
    const payoutViews: PayoutView[] = payouts.map((p) => ({
      id: String(p._id),
      claimantId: String(p.claimantId),
      claimantName: names.get(String(p.claimantId)) ?? "Unknown",
      paidById: String(p.paidById),
      paidByName: names.get(String(p.paidById)) ?? "Unknown",
      amountMinor: p.amountMinor,
      currency: p.currency,
      method: p.method as PayoutMethod,
      reference: p.reference ?? null,
      paidOn: p.paidOn,
      count: p.reimbursementIds.length,
      undoneAt: p.undoneAt ? p.undoneAt.toISOString() : null,
    }));
    return { reimbursements, payouts: payoutViews, canPay };
  });
}

/**
 * Records paying someone back for one or more owed reimbursements. Nobody
 * pays themselves back, unless nobody else in the workspace can.
 */
export function createPayout(userId: string, workspaceId: string, input: { reimbursementIds: string[]; method: PayoutMethod; reference?: string | null; paidOn: string }) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "reimbursement.pay");
    const ws = oid(workspaceId);
    const docs = await Reimbursement.find({ workspaceId: ws, _id: { $in: [...new Set(input.reimbursementIds)].map(oid) } }).lean();
    const problem = payoutProblem(docs.map((d) => ({ id: String(d._id), status: d.status as ReimbursementStatus, claimantId: String(d.claimantId) })), input.reimbursementIds);
    if (problem) throw new ApiError(400, "invalid_request", problem);
    const claimantId = String(docs[0]!.claimantId);
    if (claimantId === userId) {
      const otherPayer = (await memberGrants(ws)).some((m) => m.userId !== userId && can(m.grant, "reimbursement.pay"));
      if (otherPayer) throw new ApiError(403, "forbidden", "Someone else has to pay you back");
    }

    const payout = await Payout.create({
      workspaceId: ws,
      claimantId: oid(claimantId),
      paidById: oid(userId),
      amountMinor: docs.reduce((sum, d) => sum + d.amountMinor, 0),
      currency: docs[0]!.currency,
      method: input.method,
      reference: input.reference?.trim() || null,
      paidOn: input.paidOn,
      reimbursementIds: docs.map((d) => d._id),
    });
    // Claim each one only while it's still owed, so two payers can't both pay it.
    const claimed = await Reimbursement.updateMany({ _id: { $in: docs.map((d) => d._id) }, status: "owed" }, { $set: { status: "paid", payoutId: payout._id } });
    if (claimed.modifiedCount !== docs.length) {
      await Reimbursement.updateMany({ payoutId: payout._id }, { $set: { status: "owed", payoutId: null } });
      await payout.deleteOne();
      throw new ApiError(409, "conflict", "Some of those were just paid by someone else");
    }

    const txns = await Transaction.find({ _id: { $in: docs.map((d) => d.transactionId) } }).select("note amountMinor currency").lean();
    for (const d of docs) {
      const t = txns.find((x) => String(x._id) === String(d.transactionId));
      await recordApprovalEvent({ workspaceId: ws, kind: "paid", approvalId: d.approvalId, actorId: userId, otherUserId: claimantId, note: input.reference?.trim() || null, summary: t ? expenseSummary(t) : null });
    }
    await notifyUsers({
      userIds: [claimantId],
      workspaceId,
      kind: "approval.decided",
      title: "You've been paid back",
      body: `${formatMoney(payout.amountMinor, payout.currency)} for ${docs.length} expense${docs.length === 1 ? "" : "s"}, on ${input.paidOn}.`,
      href: `/w/${workspaceId}/reimbursements`,
    });
    return { id: String(payout._id), amountMinor: payout.amountMinor, currency: payout.currency };
  });
}

/** Undoes a payout recorded by mistake: its reimbursements are owed again. */
export function undoPayout(userId: string, workspaceId: string, payoutId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "reimbursement.pay");
    const ws = oid(workspaceId);
    const payout = await Payout.findOneAndUpdate({ _id: oid(payoutId), workspaceId: ws, undoneAt: null }, { $set: { undoneAt: new Date() } }, { returnDocument: "after" });
    if (!payout) throw new ApiError(404, "not_found", "Payout not found, or already undone");
    const docs = await Reimbursement.find({ payoutId: payout._id }).lean();
    await Reimbursement.updateMany({ payoutId: payout._id }, { $set: { status: "owed", payoutId: null } });
    const txns = await Transaction.find({ _id: { $in: docs.map((d) => d.transactionId) } }).select("note amountMinor currency").lean();
    for (const d of docs) {
      const t = txns.find((x) => String(x._id) === String(d.transactionId));
      await recordApprovalEvent({ workspaceId: ws, kind: "unpaid", approvalId: d.approvalId, actorId: userId, otherUserId: String(payout.claimantId), summary: t ? expenseSummary(t) : null });
    }
  });
}
