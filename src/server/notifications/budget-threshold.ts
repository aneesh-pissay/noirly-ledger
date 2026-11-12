import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import {
  Budget,
  Category,
  Workspace,
  WorkspaceMember,
} from "@/src/server/models";
import { notifyUsers } from "@/src/server/notifications/notify";
import { prefsFor } from "@/src/server/notification-prefs";
import { fireWorkflows } from "@/src/server/workflows";
import { emitWebhookEvent } from "@/src/server/webhooks";
import { budgetStatus } from "@/src/server/budgets";
import { defaultFiscalStart, formatMoney } from "@/src/core/locale-format";
import { crossedLevel } from "@/src/core/notification-prefs";

/**
 * After an expense, tells owners and approvers when a budget it counts
 * against crosses a level: the levels each of them set for the workspace,
 * or the budget's own alert level. Workflows hear about the budget's own.
 */
export async function maybeNotifyBudgetThreshold(input: {
  workspaceId: string;
  categoryId: string | null;
  addedExpenseMinor: number;
}): Promise<void> {
  const categoryId = input.categoryId;
  if (!categoryId || input.addedExpenseMinor <= 0) return;

  await withDb(async () => {
    // A budget on the parent covers its subcategories.
    const category = await Category.findById(new Types.ObjectId(categoryId)).select("parentId").lean();
    const budgets = await Budget.find({
      workspaceId: new Types.ObjectId(input.workspaceId),
      categoryId: { $in: [new Types.ObjectId(categoryId), ...(category?.parentId ? [category.parentId] : [])] },
    });
    if (budgets.length === 0) return;

    const members = await WorkspaceMember.find({
      workspaceId: new Types.ObjectId(input.workspaceId),
      role: { $in: ["owner", "approver"] },
    }).lean();
    const userIds = members.map((m) => m.userId.toString());
    if (userIds.length === 0) return;
    const prefs = await prefsFor(userIds, input.workspaceId);

    const workspace = await Workspace.findById(new Types.ObjectId(input.workspaceId)).select("baseCurrency fiscalYearStartMonth kind").lean();
    const fiscalStart = workspace?.fiscalYearStartMonth ?? defaultFiscalStart(workspace?.baseCurrency ?? "");
    const href = workspace?.kind === "team" ? `/w/${input.workspaceId}/budgets` : "/budgets";
    const names = new Map((await Category.find({ _id: { $in: budgets.map((b) => b.categoryId) } }).select("name").lean()).map((c) => [String(c._id), c.name]));
    for (const budget of budgets) {
      // Measured against what's available this period, carry included.
      const status = await budgetStatus(budget, fiscalStart);
      const nextSpent = status.spentMinor;
      const previous = nextSpent - input.addedExpenseMinor;
      const name = names.get(String(budget.categoryId)) ?? "A budget";
      const money = (minor: number) => formatMoney(minor, budget.currency);

      // Grouped by level, so everyone told at 80% gets the same note.
      const byLevel = new Map<number, string[]>();
      for (const userId of userIds) {
        const levels = prefs.get(userId)!.budgetLevels;
        const level = crossedLevel(levels.length ? levels : [budget.alertThresholdPct], previous, nextSpent, status.availableMinor);
        if (level !== null) byLevel.set(level, [...(byLevel.get(level) ?? []), userId]);
      }
      for (const [level, ids] of byLevel) {
        await notifyUsers({
          userIds: ids,
          workspaceId: input.workspaceId,
          kind: "budget.threshold",
          title: level >= 100 ? `${name} is ${level === 100 ? "used up" : `at ${level}%`}` : `${name} at ${level}%`,
          body: `${money(nextSpent)} of ${money(status.availableMinor)} spent this period.`,
          href,
        });
      }

      const own = crossedLevel([budget.alertThresholdPct], previous, nextSpent, status.availableMinor);
      if (own !== null) {
        await emitWebhookEvent(input.workspaceId, "budget.alert", {
          budgetId: String(budget._id),
          categoryId: String(budget.categoryId),
          categoryName: name,
          alertThresholdPct: budget.alertThresholdPct,
          spentMinor: nextSpent,
          availableMinor: status.availableMinor,
          currency: budget.currency,
        });
        await fireWorkflows({
          workspaceId: new Types.ObjectId(input.workspaceId),
          trigger: "budget.alert",
          budget: { categoryId: String(budget.categoryId), pct: status.availableMinor > 0 ? Math.round((nextSpent / status.availableMinor) * 100) : 100 },
        });
      }
    }
  });
}
