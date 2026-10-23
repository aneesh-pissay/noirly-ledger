import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Budget as BudgetModel, Category as CategoryModel, Workspace } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { baseConverter } from "@/src/server/net-worth";
import { budgetStatus } from "@/src/server/budgets";
import { budgetImpact } from "@/src/core/budgets/impact";
import { defaultFiscalStart } from "@/src/core/locale-format";
import type { BudgetImpact } from "@/src/core/sync/types";

/**
 * What an expense being entered would do to the budgets it falls under: each
 * line's category and its parent (a parent's budget covers it). Only budgets
 * whose current period contains the date are checked; nothing is saved.
 */
export function checkBudgetImpact(
  userId: string,
  workspaceId: string,
  input: { lines: Array<{ categoryId: string; amountMinor: number }>; currency: string; date: string },
): Promise<{ impacts: BudgetImpact[]; missingRate: boolean }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const workspace = await Workspace.findById(new Types.ObjectId(workspaceId)).select("baseCurrency fiscalYearStartMonth").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const ids = input.lines.map((line) => line.categoryId).filter((id) => Types.ObjectId.isValid(id));
    if (!ids.length) return { impacts: [], missingRate: false };
    const toBase = await baseConverter(workspace._id, workspace.baseCurrency);
    const categories = await CategoryModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, workspaceId: workspace._id }).select("parentId").lean();
    // How much lands on each category a budget could be on: the line's own and its parent's.
    const adds = new Map<string, number>();
    let missingRate = false;
    for (const line of input.lines) {
      const category = categories.find((c) => String(c._id) === line.categoryId);
      if (!category) continue;
      const base = toBase(line.amountMinor, input.currency.toUpperCase(), input.date);
      if (base == null) {
        missingRate = true;
        continue;
      }
      for (const key of [line.categoryId, ...(category.parentId ? [String(category.parentId)] : [])]) {
        adds.set(key, (adds.get(key) ?? 0) + base);
      }
    }
    if (!adds.size) return { impacts: [], missingRate };
    const budgets = await BudgetModel.find({ workspaceId: workspace._id, categoryId: { $in: [...adds.keys()].map((id) => new Types.ObjectId(id)) } });
    const fiscalStart = workspace.fiscalYearStartMonth ?? defaultFiscalStart(workspace.baseCurrency);
    const day = new Date(`${input.date}T12:00:00.000Z`);
    const impacts: BudgetImpact[] = [];
    for (const budget of budgets) {
      const status = await budgetStatus(budget, fiscalStart);
      if (day < status.window.from || day > status.window.to) continue;
      const addMinor = adds.get(String(budget.categoryId)) ?? 0;
      const impact = budgetImpact({ availableMinor: status.availableMinor, spentMinor: status.spentMinor, addMinor, alertThresholdPct: budget.alertThresholdPct });
      impacts.push({
        budgetId: String(budget._id),
        categoryId: String(budget.categoryId),
        period: budget.period,
        availableMinor: status.availableMinor,
        spentMinor: status.spentMinor,
        addMinor,
        ...impact,
      });
    }
    return { impacts, missingRate };
  });
}
