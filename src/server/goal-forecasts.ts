import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { GoalContribution, SavingsGoal } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { forecastGoal, type GoalForecast } from "@/src/core/goal-forecast";

/** Each goal's milestones, recent pace and when it'll be reached at that pace, by goal id. */
export function listGoalForecasts(userId: string, workspaceId: string): Promise<{ forecasts: Record<string, GoalForecast> }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = new Types.ObjectId(workspaceId);
    const today = new Date().toISOString().slice(0, 10);
    const [goals, contributions] = await Promise.all([
      SavingsGoal.find({ workspaceId: ws }).lean(),
      GoalContribution.find({ workspaceId: ws }).select("goalId date amountMinor").lean(),
    ]);
    const forecasts: Record<string, GoalForecast> = {};
    for (const goal of goals) {
      const own = contributions.filter((c) => String(c.goalId) === String(goal._id)).map((c) => ({ date: c.date, amountMinor: c.amountMinor }));
      forecasts[String(goal._id)] = forecastGoal(
        { targetMinor: goal.targetAmountMinor, currentMinor: goal.currentAmountMinor, targetDate: goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null },
        own,
        today,
      );
    }
    return { forecasts };
  });
}
