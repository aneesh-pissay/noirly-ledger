import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Budget as BudgetModel, Category as CategoryModel, Transaction as TransactionModel, Workspace } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { listAccounts } from "@/src/server/accounts";
import { baseConverter } from "@/src/server/net-worth";
import { isLiability } from "@/src/core/accounts";
import { topLevelOf } from "@/src/core/categories";
import { monthlyEquivalent } from "@/src/core/budgets/zero-based";
import type { BudgetPeriod } from "@/src/core/models/enums";
import type { ForecastBaselineResult } from "@/src/core/sync/types";

export const FORECAST_BASES = ["recent", "budgets"] as const;
export type ForecastBasis = (typeof FORECAST_BASES)[number];

const UNCATEGORIZED = "uncategorized";

/**
 * What a typical month looks like for the forecast: income and spending per
 * top-level category averaged over the last `lookbackMonths` full months
 * (with "budgets", a category's budgets replace its average), and cash on
 * hand today less card debt, all in base currency.
 */
export function getForecastBaseline(userId: string, workspaceId: string, basis: ForecastBasis, lookbackMonths = 3): Promise<ForecastBaselineResult> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const workspace = await Workspace.findById(new Types.ObjectId(workspaceId)).select("baseCurrency").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - lookbackMonths, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
    const today = now.toISOString().slice(0, 10);

    const [accounts, toBase, categories, income, spending, budgets] = await Promise.all([
      listAccounts(userId, workspaceId),
      baseConverter(workspace._id, workspace.baseCurrency),
      CategoryModel.find({ workspaceId: workspace._id, deletedAt: null }).select("name parentId").lean(),
      TransactionModel.aggregate<{ total: number }>([
        { $match: { workspaceId: workspace._id, isPosted: true, deletedAt: null, type: "income", date: { $gte: from, $lte: to } } },
        { $group: { _id: null, total: { $sum: "$baseAmountMinor" } } },
      ]),
      TransactionModel.aggregate<{ _id: Types.ObjectId | null; total: number }>([
        { $match: { workspaceId: workspace._id, isPosted: true, deletedAt: null, type: { $in: ["expense", "refund"] }, date: { $gte: from, $lte: to } } },
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
        {
          $group: {
            _id: "$line.categoryId",
            total: { $sum: { $cond: [{ $eq: ["$type", "refund"] }, { $multiply: ["$line.baseAmountMinor", -1] }, "$line.baseAmountMinor"] } },
          },
        },
      ]),
      basis === "budgets" ? BudgetModel.find({ workspaceId: workspace._id }).select("categoryId period limitAmountMinor").lean() : Promise.resolve([]),
    ]);

    let startCashMinor = 0;
    const missing = new Set<string>();
    for (const account of accounts) {
      if (account.kind === "loan") continue;
      const converted = toBase(account.balanceMinor, account.currency, today);
      if (converted == null) {
        missing.add(account.currency);
        continue;
      }
      startCashMinor += isLiability(account.kind) ? -converted : converted;
    }

    const nodes = categories.map((c) => ({ id: String(c._id), name: c.name, parentId: c.parentId ? String(c.parentId) : null }));
    const top = (id: Types.ObjectId | null) => {
      if (!id || !nodes.some((n) => n.id === String(id))) return UNCATEGORIZED;
      return topLevelOf(String(id), nodes);
    };
    const recent = new Map<string, number>();
    for (const row of spending) recent.set(top(row._id), (recent.get(top(row._id)) ?? 0) + row.total);
    const fromBudgets = new Map<string, number>();
    for (const budget of budgets) {
      const share = monthlyEquivalent(budget.period as BudgetPeriod, budget.limitAmountMinor);
      if (share == null) continue;
      const key = top(budget.categoryId);
      fromBudgets.set(key, (fromBudgets.get(key) ?? 0) + share);
    }

    const keys = new Set([...recent.keys(), ...fromBudgets.keys()]);
    const lines = [...keys].map((categoryId) => {
      const budgeted = fromBudgets.get(categoryId);
      const average = Math.round(Math.max(0, recent.get(categoryId) ?? 0) / lookbackMonths);
      return budgeted != null
        ? { categoryId, monthlyMinor: budgeted, source: "budget" as const }
        : { categoryId, monthlyMinor: average, source: "recent" as const };
    }).filter((line) => line.monthlyMinor > 0);

    return {
      basis,
      baseCurrency: workspace.baseCurrency,
      lookbackMonths,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      today,
      baseline: {
        startCashMinor,
        monthlyIncomeMinor: Math.round((income[0]?.total ?? 0) / lookbackMonths),
        spendingByCategory: Object.fromEntries(lines.map((line) => [line.categoryId, line.monthlyMinor])),
      },
      lines,
      missingRates: [...missing].sort(),
    };
  });
}
