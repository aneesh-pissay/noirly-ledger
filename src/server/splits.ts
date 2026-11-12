import type { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { Transaction as TransactionModel } from "@/src/server/models";
import { allocate, checkSplits, type SplitLine } from "@/src/core/splits";
import type { TransactionType } from "@/src/core/models/enums";

export type StoredSplit = { categoryId: Types.ObjectId | null; amountMinor: number; baseAmountMinor: number; note: string | null };

/** Checks the lines against the amount, or throws the reason as a 400. */
export function assertSplits(type: TransactionType, amountMinor: number, lines: SplitLine[]) {
  const result = checkSplits(type, amountMinor, lines);
  if (!result.ok) throw new ApiError(400, "invalid_request", result.error);
}

/** Lines ready to store, each with its share of the base amount (adding up exactly). */
export function storedSplits(lines: ReadonlyArray<{ categoryId?: Types.ObjectId | null; amountMinor: number; note?: string | null }>, baseAmountMinor: number): StoredSplit[] {
  const base = allocate(baseAmountMinor, lines.map((line) => line.amountMinor));
  return lines.map((line, i) => ({ categoryId: line.categoryId ?? null, amountMinor: line.amountMinor, baseAmountMinor: base[i]!, note: line.note ?? null }));
}

/** A refund of a split expense splits the same way, in proportion. */
export function refundSplits(expenseSplits: StoredSplit[], amountMinor: number) {
  const shares = allocate(amountMinor, expenseSplits.map((line) => line.amountMinor));
  return expenseSplits.map((line, i) => ({ categoryId: line.categoryId, amountMinor: shares[i]!, note: line.note })).filter((line) => line.amountMinor > 0);
}

/**
 * Spending (expenses less refunds) in base currency across some categories,
 * counting a split transaction's lines in their own categories.
 */
export async function spentInCategories(match: Record<string, unknown>, categoryIds: Types.ObjectId[]) {
  const rows = await TransactionModel.aggregate<{ total: number }>([
    { $match: { ...match, type: { $in: ["expense", "refund"] }, $or: [{ categoryId: { $in: categoryIds } }, { "splits.categoryId": { $in: categoryIds } }] } },
    {
      $project: {
        type: 1,
        line: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$splits", []] } }, 0] },
            "$splits",
            [{ categoryId: "$categoryId", baseAmountMinor: "$baseAmountMinor" }],
          ],
        },
      },
    },
    { $unwind: "$line" },
    { $match: { "line.categoryId": { $in: categoryIds } } },
    {
      $group: {
        _id: null,
        total: { $sum: { $cond: [{ $eq: ["$type", "refund"] }, { $multiply: ["$line.baseAmountMinor", -1] }, "$line.baseAmountMinor"] } },
      },
    },
  ]);
  return rows[0]?.total ?? 0;
}
