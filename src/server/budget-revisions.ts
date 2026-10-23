import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Budget as BudgetModel, BudgetRevision, type BudgetDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { checkBudgetMove, type RevisionReason } from "@/src/core/budgets/revisions";
import type { BudgetPeriod } from "@/src/core/models/enums";
import type { BudgetRevisionRecord } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** Keeps a change to a budget's limit. */
export async function recordRevision(input: {
  budget: Pick<BudgetDocument, "_id" | "workspaceId" | "categoryId" | "period">;
  previousLimitMinor: number | null;
  limitMinor: number | null;
  reason: RevisionReason;
  userId: string;
  note?: string | null;
  moveId?: string | null;
  otherBudgetId?: Types.ObjectId | null;
}) {
  await BudgetRevision.create({
    workspaceId: input.budget.workspaceId,
    budgetId: input.budget._id,
    categoryId: input.budget.categoryId,
    period: input.budget.period,
    previousLimitMinor: input.previousLimitMinor,
    limitMinor: input.limitMinor,
    reason: input.reason,
    note: input.note?.trim() || null,
    moveId: input.moveId ?? null,
    otherBudgetId: input.otherBudgetId ?? null,
    createdById: new Types.ObjectId(input.userId),
  });
}

function mapRevision(doc: { _id: Types.ObjectId; budgetId: Types.ObjectId; categoryId: Types.ObjectId; period: string; previousLimitMinor?: number | null; limitMinor?: number | null; reason: string; note?: string | null; moveId?: string | null; otherBudgetId?: Types.ObjectId | null; createdAt: Date }): BudgetRevisionRecord {
  return {
    id: String(doc._id),
    budgetId: String(doc.budgetId),
    categoryId: String(doc.categoryId),
    period: doc.period as BudgetPeriod,
    previousLimitMinor: doc.previousLimitMinor ?? null,
    limitMinor: doc.limitMinor ?? null,
    reason: doc.reason as RevisionReason,
    note: doc.note ?? null,
    moveId: doc.moveId ?? null,
    otherBudgetId: doc.otherBudgetId ? String(doc.otherBudgetId) : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** The workspace's latest budget changes, newest first; one budget's when budgetId is given. */
export function listBudgetRevisions(userId: string, workspaceId: string, budgetId?: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await BudgetRevision.find({ workspaceId: oid(workspaceId), ...(budgetId ? { budgetId: oid(budgetId) } : {}) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .lean();
    return docs.map(mapRevision);
  });
}

/**
 * Moves part of one budget's limit to another of the same period. The source
 * is lowered only if it still has the amount, so two moves at once can't take
 * it below zero.
 */
export function moveBudgetMoney(userId: string, workspaceId: string, input: { fromBudgetId: string; toBudgetId: string; amountMinor: number; note?: string | null }) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const [from, to] = await Promise.all([
      BudgetModel.findOne({ _id: oid(input.fromBudgetId), workspaceId: ws }).lean(),
      BudgetModel.findOne({ _id: oid(input.toBudgetId), workspaceId: ws }).lean(),
    ]);
    const result = checkBudgetMove({
      from: from ? { id: String(from._id), period: from.period as BudgetPeriod, limitMinor: from.limitAmountMinor, currency: from.currency } : null,
      to: to ? { id: String(to._id), period: to.period as BudgetPeriod, currency: to.currency } : null,
      amountMinor: input.amountMinor,
    });
    if (!result.ok) throw new ApiError(400, "invalid_request", result.error);
    const lowered = await BudgetModel.findOneAndUpdate(
      { _id: from!._id, limitAmountMinor: { $gte: input.amountMinor } },
      { $inc: { limitAmountMinor: -input.amountMinor } },
      { returnDocument: "after" },
    );
    if (!lowered) throw new ApiError(409, "conflict", "That budget changed meanwhile; try again");
    const raised = await BudgetModel.findOneAndUpdate({ _id: to!._id }, { $inc: { limitAmountMinor: input.amountMinor } }, { returnDocument: "after" });
    const moveId = randomUUID();
    await recordRevision({ budget: from!, previousLimitMinor: from!.limitAmountMinor, limitMinor: lowered.limitAmountMinor, reason: "moved_out", userId, note: input.note, moveId, otherBudgetId: to!._id });
    await recordRevision({ budget: to!, previousLimitMinor: to!.limitAmountMinor, limitMinor: raised?.limitAmountMinor ?? to!.limitAmountMinor + input.amountMinor, reason: "moved_in", userId, note: input.note, moveId, otherBudgetId: from!._id });
    return { fromLimitMinor: lowered.limitAmountMinor, toLimitMinor: raised?.limitAmountMinor ?? null };
  });
}

/** Puts a budget back to the limit an earlier revision left it at. */
export function restoreBudgetRevision(userId: string, revisionId: string) {
  return withDb(async () => {
    const revision = await BudgetRevision.findById(oid(revisionId)).lean();
    if (!revision) throw new ApiError(404, "not_found", "Revision not found");
    await requireAction(userId, String(revision.workspaceId), "budget.manage");
    if (revision.limitMinor == null) throw new ApiError(400, "invalid_request", "That revision deleted the budget; there's no limit to restore");
    const budget = await BudgetModel.findById(revision.budgetId);
    if (!budget) throw new ApiError(404, "not_found", "That budget has been deleted");
    const previous = budget.limitAmountMinor;
    if (previous === revision.limitMinor) return { limitMinor: previous };
    budget.limitAmountMinor = revision.limitMinor;
    await budget.save();
    await recordRevision({ budget, previousLimitMinor: previous, limitMinor: revision.limitMinor, reason: "restored", userId, note: `Back to the limit from ${revision.createdAt.toISOString().slice(0, 10)}` });
    return { limitMinor: revision.limitMinor };
  });
}
