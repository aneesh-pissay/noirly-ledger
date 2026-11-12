import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { Transaction as TransactionModel } from "@/src/server/models";
import { checkRefund } from "@/src/core/refunds";

/** How much of each expense live refunds have taken back, in the expense's currency. */
export async function refundedByExpense(expenseIds: Types.ObjectId[], excludeId?: Types.ObjectId) {
  const refunded = new Map<string, number>();
  if (!expenseIds.length) return refunded;
  const rows = await TransactionModel.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { refundOfId: { $in: expenseIds }, type: "refund", deletedAt: null, ...(excludeId ? { _id: { $ne: excludeId } } : {}) } },
    { $group: { _id: "$refundOfId", total: { $sum: "$amountMinor" } } },
  ]);
  for (const row of rows) refunded.set(String(row._id), row.total);
  return refunded;
}

/**
 * The expense a refund reverses, once it's checked: in this workspace, posted
 * and not a pool's, in the refund's currency, with enough left to refund.
 * `excludeId` leaves out the refund being edited.
 */
export async function expenseToRefund(
  workspaceId: Types.ObjectId,
  input: { refundOfId?: string | null; amountMinor: number; currency: string },
  excludeId?: Types.ObjectId,
) {
  const id = input.refundOfId && Types.ObjectId.isValid(input.refundOfId) ? new Types.ObjectId(input.refundOfId) : null;
  const original = id ? await TransactionModel.findOne({ _id: id, workspaceId, deletedAt: null }) : null;
  const refunded = original ? (await refundedByExpense([original._id], excludeId)).get(String(original._id)) ?? 0 : 0;
  const result = checkRefund({
    original: original
      ? { type: original.type, currency: original.currency, amountMinor: original.amountMinor, budgetPoolId: original.budgetPoolId ? String(original.budgetPoolId) : null, isPosted: original.isPosted }
      : null,
    refundedMinor: refunded,
    amountMinor: input.amountMinor,
    currency: input.currency,
  });
  if (!result.ok) throw new ApiError(400, "invalid_request", result.error);
  return original!;
}
