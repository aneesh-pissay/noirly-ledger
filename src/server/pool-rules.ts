import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ApprovalRequest, BudgetPool, Transaction, WorkspaceMember } from "@/src/server/models";
import { requireAction } from "@/src/server/workspace/members";
import { mapBudgetPool, poolRulesOf } from "@/src/server/mappers";
import { memberLimitCheck, memberLimitFor, memberLimitWindow, type MemberLimitPeriod } from "@/src/core/pool-rules";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

export type PoolRulesInput = {
  approverIds: string[];
  autoApproveUpToMinor: number | null;
  memberLimitMinor: number | null;
  memberLimits: Array<{ userId: string; limitMinor: number }>;
  memberLimitPeriod: MemberLimitPeriod;
};

/** Sets a pool's own approvers, auto-approval and member limits. Those who manage pools do. */
export function updatePoolRules(userId: string, poolId: string, input: PoolRulesInput) {
  return withDb(async () => {
    const pool = await BudgetPool.findById(oid(poolId));
    if (!pool || pool.archivedAt) throw new ApiError(404, "not_found", "Budget pool not found");
    await requireAction(userId, String(pool.workspaceId), "pool.manage");
    // Only people in the workspace, each once.
    const ids = [...new Set([...input.approverIds, ...input.memberLimits.map((l) => l.userId)])].map(oid);
    const members = new Set((await WorkspaceMember.find({ workspaceId: pool.workspaceId, userId: { $in: ids } }).select("userId").lean()).map((m) => String(m.userId)));
    const limits = new Map<string, number>();
    for (const l of input.memberLimits) if (members.has(l.userId)) limits.set(l.userId, l.limitMinor);
    pool.set({
      approverIds: [...new Set(input.approverIds)].filter((id) => members.has(id)).map(oid),
      autoApproveUpToMinor: input.autoApproveUpToMinor,
      memberLimitMinor: input.memberLimitMinor,
      memberLimits: [...limits].map(([id, limitMinor]) => ({ userId: oid(id), limitMinor })),
      memberLimitPeriod: input.memberLimitPeriod,
    });
    await pool.save();
    return mapBudgetPool(pool);
  });
}

/** What a member has put through a pool in a window: approved, plus what's still waiting. */
export async function memberSpent(poolId: Types.ObjectId, userId: string, window: { from: string; to: string } | null) {
  const open = await ApprovalRequest.find({ budgetPoolId: poolId, submittedById: oid(userId), status: { $in: ["submitted", "approved"] } }).select("transactionId").lean();
  if (!open.length) return 0;
  const rows = await Transaction.aggregate<{ total: number }>([
    {
      $match: {
        _id: { $in: open.map((a) => a.transactionId) },
        deletedAt: null,
        ...(window ? { date: { $gte: new Date(`${window.from}T00:00:00.000Z`), $lte: new Date(`${window.to}T23:59:59.999Z`) } } : {}),
      },
    },
    { $group: { _id: null, total: { $sum: "$baseAmountMinor" } } },
  ]);
  return rows[0]?.total ?? 0;
}

/** Where a member stands against their limit in a pool if they add an expense dated `spentOn`; null with no limit. */
export async function memberLimitStatus(pool: Parameters<typeof poolRulesOf>[0] & { _id: Types.ObjectId }, userId: string, spentOn: string, addMinor: number) {
  const rules = poolRulesOf(pool);
  const limit = memberLimitFor(rules, userId);
  if (limit === null) return null;
  const window = memberLimitWindow(rules.memberLimitPeriod, spentOn);
  const check = memberLimitCheck(limit, await memberSpent(pool._id, userId, window), addMinor)!;
  return { ...check, period: rules.memberLimitPeriod, window };
}
