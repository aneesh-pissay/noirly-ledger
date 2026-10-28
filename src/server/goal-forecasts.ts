import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { ApiError } from "@/src/server/api/http";
import { GoalContribution, SavingsGoal, Workspace } from "@/src/server/models";
import { listMembers, requireMembershipRole } from "@/src/server/workspace/members";
import { forecastGoal, reachedAt, type GoalForecast } from "@/src/core/goal-forecast";
import { memberShares, pledgedMonthly, pledgeStatus } from "@/src/core/goal-sharing";

/**
 * Each goal's milestones, recent pace and when it'll be reached at that
 * pace, by goal id; in a shared workspace, also who's put in what and the
 * members' pledges.
 */
export function listGoalForecasts(userId: string, workspaceId: string): Promise<{ forecasts: Record<string, GoalForecast> }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = new Types.ObjectId(workspaceId);
    const today = new Date().toISOString().slice(0, 10);
    const [goals, contributions, workspace] = await Promise.all([
      SavingsGoal.find({ workspaceId: ws }).lean(),
      GoalContribution.find({ workspaceId: ws }).select("goalId date amountMinor createdById").lean(),
      Workspace.findById(ws).select("kind").lean(),
    ]);
    const shared = workspace?.kind !== "personal";
    const names = shared ? new Map((await listMembers(workspaceId)).map((m) => [m.userId, m.displayName])) : new Map<string, string>();
    const nameOf = (id: string) => names.get(id) ?? "A former member";
    const forecasts: Record<string, GoalForecast> = {};
    for (const goal of goals) {
      const own = contributions.filter((c) => String(c.goalId) === String(goal._id)).map((c) => ({ date: c.date, amountMinor: c.amountMinor }));
      const forecast = forecastGoal(
        { targetMinor: goal.targetAmountMinor, currentMinor: goal.currentAmountMinor, targetDate: goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : null },
        own,
        today,
      );
      if (shared) {
        const byMember = contributions
          .filter((c) => String(c.goalId) === String(goal._id))
          .map((c) => ({ userId: String(c.createdById), date: c.date, amountMinor: c.amountMinor }));
        const pledges = (goal.pledges ?? []).map((p) => ({ userId: String(p.userId), monthlyMinor: p.monthlyMinor }));
        const pledgedMinor = pledgedMonthly(pledges);
        forecast.sharing = {
          shares: memberShares(byMember).map((s) => ({ ...s, name: nameOf(s.userId) })),
          pledges: pledgeStatus(pledges, byMember, today).map((p) => ({ ...p, name: nameOf(p.userId) })),
          pledgedMinor,
          pledgedDate: reachedAt(goal.targetAmountMinor - goal.currentAmountMinor, pledgedMinor, today),
          myPledgeMinor: pledges.find((p) => p.userId === userId)?.monthlyMinor ?? 0,
        };
      }
      forecasts[String(goal._id)] = forecast;
    }
    return { forecasts };
  });
}

/** Sets what the person means to put into a goal each month; nothing takes their pledge back. */
export function setPledge(userId: string, goalId: string, monthlyMinor: number) {
  return withDb(async () => {
    if (!Types.ObjectId.isValid(goalId)) throw new ApiError(400, "invalid_request", "Invalid id");
    const goal = await SavingsGoal.findById(new Types.ObjectId(goalId));
    if (!goal) throw new ApiError(404, "not_found", "Goal not found");
    await requireMembershipRole(userId, String(goal.workspaceId));
    const others = (goal.pledges ?? []).filter((p) => String(p.userId) !== userId);
    goal.set("pledges", monthlyMinor > 0 ? [...others, { userId: new Types.ObjectId(userId), monthlyMinor }] : others);
    await goal.save();
    return { monthlyMinor };
  });
}
