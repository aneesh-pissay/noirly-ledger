import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Budget as BudgetModel, BudgetPlan, Category as CategoryModel, Transaction as TransactionModel, Workspace } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { monthOf, monthlyEquivalent, planSummary } from "@/src/core/budgets/zero-based";
import type { BudgetPeriod } from "@/src/core/models/enums";
import type { MonthPlan } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, "invalid_request", "Month must be YYYY-MM");
}

/**
 * The month's zero-based plan: the income to plan with (expected if set,
 * otherwise what's arrived), what each category's budgets assign for the
 * month, and what's left to assign.
 */
export function getMonthPlan(userId: string, workspaceId: string, month: string): Promise<MonthPlan> {
  return withDb(async () => {
    assertMonth(month);
    await requireMembershipRole(userId, workspaceId);
    const workspace = await Workspace.findById(oid(workspaceId)).select("baseCurrency").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const { from, to } = monthOf(`${month}-01`);
    const [plan, received, budgets, categories] = await Promise.all([
      BudgetPlan.findOne({ workspaceId: workspace._id, month }).lean(),
      TransactionModel.aggregate<{ total: number }>([
        {
          $match: {
            workspaceId: workspace._id,
            type: "income",
            isPosted: true,
            deletedAt: null,
            date: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) },
          },
        },
        { $group: { _id: null, total: { $sum: "$baseAmountMinor" } } },
      ]),
      BudgetModel.find({ workspaceId: workspace._id }).lean(),
      CategoryModel.find({ workspaceId: workspace._id, deletedAt: null, archivedAt: null }).select("_id").lean(),
    ]);
    const live = new Set(categories.map((c) => String(c._id)));
    const receivedIncomeMinor = received[0]?.total ?? 0;
    const expectedIncomeMinor = plan?.expectedIncomeMinor ?? null;

    const byCategory = new Map<string, { monthlyMinor: number; monthlyBudgetId: string | null; monthlyLimitMinor: number | null }>();
    for (const budget of budgets) {
      const key = String(budget.categoryId);
      if (!live.has(key)) continue;
      const share = monthlyEquivalent(budget.period as BudgetPeriod, budget.limitAmountMinor);
      if (share == null) continue;
      const line = byCategory.get(key) ?? { monthlyMinor: 0, monthlyBudgetId: null, monthlyLimitMinor: null };
      line.monthlyMinor += share;
      if (budget.period === "monthly") {
        line.monthlyBudgetId = String(budget._id);
        line.monthlyLimitMinor = budget.limitAmountMinor;
      }
      byCategory.set(key, line);
    }
    const incomeMinor = expectedIncomeMinor ?? receivedIncomeMinor;
    const lines = [...byCategory.entries()].map(([categoryId, line]) => ({ categoryId, ...line }));
    return {
      month,
      baseCurrency: workspace.baseCurrency,
      expectedIncomeMinor,
      receivedIncomeMinor,
      incomeMinor,
      ...planSummary(incomeMinor, lines.map((line) => line.monthlyMinor)),
      lines,
    };
  });
}

/** Sets (or clears, with null) the income the month is planned with. */
export function setExpectedIncome(userId: string, workspaceId: string, month: string, expectedIncomeMinor: number | null) {
  return withDb(async () => {
    assertMonth(month);
    await requireAction(userId, workspaceId, "budget.manage");
    await BudgetPlan.updateOne(
      { workspaceId: oid(workspaceId), month },
      { $set: { expectedIncomeMinor }, $setOnInsert: { workspaceId: oid(workspaceId), month } },
      { upsert: true },
    );
  });
}
