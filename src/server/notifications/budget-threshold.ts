import { Types } from "mongoose";
import { isoDate, periodWindow } from "@/src/core/budgets/period";
import { crossedThreshold } from "@/src/core/reports/format";
import { withDb } from "@/src/server/db/mongodb";
import {
  Budget,
  Transaction,
  WorkspaceMember,
} from "@/src/server/models";
import { notifyUsers } from "@/src/server/notifications/notify";
import { SPEND_TYPES, spentSum } from "@/src/server/refunds";

export async function maybeNotifyBudgetThreshold(input: {
  workspaceId: string;
  categoryId: string | null;
  addedExpenseMinor: number;
}): Promise<void> {
  const categoryId = input.categoryId;
  if (!categoryId || input.addedExpenseMinor <= 0) return;

  await withDb(async () => {
    const budgets = await Budget.find({
      workspaceId: new Types.ObjectId(input.workspaceId),
      categoryId: new Types.ObjectId(categoryId),
    });
    if (budgets.length === 0) return;

    const members = await WorkspaceMember.find({
      workspaceId: new Types.ObjectId(input.workspaceId),
      role: { $in: ["owner", "approver"] },
    }).lean();
    const userIds = members.map((m) => m.userId.toString());
    if (userIds.length === 0) return;

    for (const budget of budgets) {
      const window = periodWindow(budget.period, new Date(), {
        start: budget.periodStart ? isoDate(budget.periodStart) : null,
        end: budget.periodEnd ? isoDate(budget.periodEnd) : null,
      });
      const spent = await Transaction.aggregate<{ total: number }>([
        {
          $match: {
            workspaceId: new Types.ObjectId(input.workspaceId),
            categoryId: new Types.ObjectId(categoryId),
            type: { $in: SPEND_TYPES },
            isPosted: true,
            deletedAt: null,
            date: { $gte: window.from, $lte: window.to },
          },
        },
        { $group: { _id: null, total: spentSum } },
      ]);
      const nextSpent = spent[0]?.total ?? 0;
      const previous = nextSpent - input.addedExpenseMinor;
      if (
        !crossedThreshold({
          previousSpentMinor: previous,
          nextSpentMinor: nextSpent,
          limitAmountMinor: budget.limitAmountMinor,
          alertThresholdPct: budget.alertThresholdPct,
        })
      ) {
        continue;
      }
      await notifyUsers({
        userIds,
        workspaceId: input.workspaceId,
        kind: "budget.threshold",
        title: "Budget threshold reached",
        body: `Spend crossed ${budget.alertThresholdPct}% of a category budget.`,
        href: "/budgets",
      });
    }
  });
}
