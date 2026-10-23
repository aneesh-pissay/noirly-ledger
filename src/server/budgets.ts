import type { Types } from "mongoose";
import { Transaction as TransactionModel, type BudgetDocument } from "@/src/server/models";
import { budgetCategoryIds } from "@/src/server/categories/tree";
import { spentInCategories } from "@/src/server/splits";
import { isoDate, periodWindow } from "@/src/core/budgets/period";
import { carriedIn, finishedPeriods, type RolloverMode } from "@/src/core/budgets/rollover";

/**
 * Spending (expenses less refunds) per day in base currency across some
 * categories, split lines counted in their own categories, between two dates.
 */
async function spentByDay(workspaceId: Types.ObjectId, categoryIds: Types.ObjectId[], from: Date, to: Date) {
  const rows = await TransactionModel.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        workspaceId,
        isPosted: true,
        deletedAt: null,
        date: { $gte: from, $lte: to },
        type: { $in: ["expense", "refund"] },
        $or: [{ categoryId: { $in: categoryIds } }, { "splits.categoryId": { $in: categoryIds } }],
      },
    },
    {
      $project: {
        type: 1,
        date: 1,
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
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        total: { $sum: { $cond: [{ $eq: ["$type", "refund"] }, { $multiply: ["$line.baseAmountMinor", -1] }, "$line.baseAmountMinor"] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [row._id, row.total]));
}

/**
 * Where a budget stands now: its current period, what's been spent in it,
 * what's carried in from earlier periods (when it rolls over), and so what's
 * available and left.
 */
export async function budgetStatus(budget: BudgetDocument, fiscalYearStartMonth: number, now = new Date()) {
  const window = periodWindow(budget.period, now, {
    start: budget.periodStart ? isoDate(budget.periodStart) : null,
    end: budget.periodEnd ? isoDate(budget.periodEnd) : null,
  }, fiscalYearStartMonth);
  const categoryIds = await budgetCategoryIds(budget.categoryId);
  const spentMinor = await spentInCategories(
    { workspaceId: budget.workspaceId, isPosted: true, deletedAt: null, date: { $gte: window.from, $lte: window.to } },
    categoryIds,
  );

  const mode = (budget.rollover ?? "none") as RolloverMode;
  let carriedInMinor = 0;
  if (mode !== "none") {
    const periods = finishedPeriods(budget.period, budget.rolloverSince ?? budget.createdAt, now, fiscalYearStartMonth);
    if (periods.length) {
      const byDay = await spentByDay(budget.workspaceId, categoryIds, periods[0]!.from, periods.at(-1)!.to);
      const spentPerPeriod = periods.map((period) => {
        const from = isoDate(period.from);
        const to = isoDate(period.to);
        let total = 0;
        for (const [day, amount] of byDay) if (day >= from && day <= to) total += amount;
        return total;
      });
      carriedInMinor = carriedIn(mode, budget.limitAmountMinor, spentPerPeriod);
    }
  }
  const availableMinor = budget.limitAmountMinor + carriedInMinor;
  return {
    window,
    spentMinor,
    carriedInMinor,
    availableMinor,
    remainingMinor: availableMinor - spentMinor,
  };
}
