import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { BudgetPool, LedgerUser, PoolContribution, Workspace, WorkspaceMember, type BudgetPoolDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { notifyUsers } from "@/src/server/notifications/notify";
import { appendAudit } from "@/src/server/audit";
import { can } from "@/src/core/permissions/can";
import { formatMoney } from "@/src/core/locale-format";
import { allocationProblem, expectedShares, standings, type AllocationMode, type PoolAllocation, type PoolFunding } from "@/src/core/pool-contributions";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

async function requirePool(poolId: string) {
  const pool = await BudgetPool.findById(oid(poolId));
  if (!pool || pool.archivedAt) throw new ApiError(404, "not_found", "Budget pool not found");
  return pool;
}

function allocationOf(pool: BudgetPoolDocument): PoolAllocation {
  return {
    mode: (pool.allocationMode ?? "none") as AllocationMode,
    targetMinor: pool.allocationTargetMinor ?? null,
    shares: (pool.allocationShares ?? []).map((s) => ({ userId: String(s.userId), value: s.value })),
  };
}

async function baseCurrencyOf(workspaceId: Types.ObjectId) {
  return (await Workspace.findById(workspaceId).select("baseCurrency").lean())?.baseCurrency ?? "USD";
}

/** Who owes what into a pool given what's been put in, and its recent contributions. Anyone in the workspace sees it. */
export function poolFunding(userId: string, poolId: string): Promise<PoolFunding> {
  return withDb(async () => {
    const pool = await requirePool(poolId);
    const grant = await requireMembershipRole(userId, String(pool.workspaceId));
    const docs = await PoolContribution.find({ poolId: pool._id, deletedAt: null }).sort({ date: -1, createdAt: -1 }).lean();
    const contributed = new Map<string, number>();
    for (const d of docs) contributed.set(String(d.userId), (contributed.get(String(d.userId)) ?? 0) + d.amountMinor);
    const allocation = allocationOf(pool);
    const expected = expectedShares(allocation, pool.limitAmountMinor);
    const ids = [...new Set([...expected.keys(), ...contributed.keys(), ...docs.map((d) => String(d.recordedById))])];
    const names = new Map((await LedgerUser.find({ _id: { $in: ids.map(oid) } }).select("displayName").lean()).map((u) => [String(u._id), u.displayName]));
    const nameOf = (id: string) => names.get(id) ?? "Unknown";
    const contributedMinor = [...contributed.values()].reduce((a, b) => a + b, 0);
    return {
      allocation,
      targetMinor: allocation.targetMinor ?? pool.limitAmountMinor,
      contributedMinor,
      balanceMinor: contributedMinor - pool.currentSpendMinor,
      standings: standings(expected, contributed).map((s) => ({ ...s, name: nameOf(s.userId) })),
      contributions: docs.slice(0, 100).map((d) => ({
        id: String(d._id),
        userId: String(d.userId),
        name: nameOf(String(d.userId)),
        amountMinor: d.amountMinor,
        date: d.date,
        note: d.note ?? null,
        recordedByName: nameOf(String(d.recordedById)),
        canRemove: String(d.recordedById) === userId || String(d.userId) === userId || can(grant, "pool.manage"),
      })),
      canManage: can(grant, "pool.manage"),
    };
  });
}

/**
 * Records money put into a pool: your own, or (for those who manage pools)
 * someone else's, who is then told.
 */
export function addContribution(userId: string, poolId: string, input: { amountMinor: number; date: string; note?: string | null; forUserId?: string | null }) {
  return withDb(async () => {
    const pool = await requirePool(poolId);
    const workspaceId = String(pool.workspaceId);
    const forUserId = input.forUserId ?? userId;
    if (forUserId !== userId) await requireAction(userId, workspaceId, "pool.manage");
    else await requireMembershipRole(userId, workspaceId);
    if (!(await WorkspaceMember.exists({ workspaceId: pool.workspaceId, userId: oid(forUserId) }))) {
      throw new ApiError(400, "invalid_request", "They aren't in this workspace");
    }
    if (input.amountMinor <= 0) throw new ApiError(400, "invalid_request", "Enter an amount above zero");
    const doc = await PoolContribution.create({
      workspaceId: pool.workspaceId,
      poolId: pool._id,
      userId: oid(forUserId),
      amountMinor: input.amountMinor,
      date: input.date,
      note: input.note?.trim() || null,
      recordedById: oid(userId),
    });
    const currency = await baseCurrencyOf(pool.workspaceId);
    const forName = forUserId === userId ? null : (await LedgerUser.findById(oid(forUserId)).select("displayName").lean())?.displayName ?? "someone";
    await appendAudit({
      workspaceId: pool.workspaceId,
      actorId: userId,
      action: "pool.contribution",
      entity: "pool",
      entityId: pool._id,
      summary: `${formatMoney(input.amountMinor, currency)} into ${pool.name} on ${input.date}${forName ? `, for ${forName}` : ""}`,
      data: { contributionId: doc._id, userId: forUserId, amountMinor: input.amountMinor, date: input.date, note: input.note?.trim() || null },
    });
    if (forUserId !== userId) {
      await notifyUsers({
        userIds: [forUserId],
        workspaceId,
        kind: "pool.contribution",
        title: `Contribution to ${pool.name} recorded`,
        body: `${formatMoney(input.amountMinor, currency)} on ${input.date} was recorded as yours.`,
        href: `/w/${workspaceId}/pools/${String(pool._id)}`,
      });
    }
    return { id: String(doc._id) };
  });
}

/** Takes a contribution out (it stays on record, marked). Whoever recorded it, its member, or a pool manager can. */
export function removeContribution(userId: string, contributionId: string) {
  return withDb(async () => {
    const doc = await PoolContribution.findOne({ _id: oid(contributionId), deletedAt: null });
    if (!doc) throw new ApiError(404, "not_found", "Contribution not found");
    const grant = await requireMembershipRole(userId, String(doc.workspaceId));
    if (String(doc.recordedById) !== userId && String(doc.userId) !== userId && !can(grant, "pool.manage")) {
      throw new ApiError(403, "forbidden", "Only they or a pool manager can remove it");
    }
    doc.deletedAt = new Date();
    await doc.save();
    const currency = await baseCurrencyOf(doc.workspaceId);
    await appendAudit({
      workspaceId: doc.workspaceId,
      actorId: userId,
      action: "pool.contribution_removed",
      entity: "pool",
      entityId: doc.poolId,
      summary: `Contribution of ${formatMoney(doc.amountMinor, currency)} on ${doc.date} taken out`,
      data: { contributionId: doc._id, userId: doc.userId, amountMinor: doc.amountMinor, date: doc.date },
    });
  });
}

/** Sets who's expected to put what in. Those who manage pools do. */
export function setAllocation(userId: string, poolId: string, allocation: PoolAllocation) {
  return withDb(async () => {
    const pool = await requirePool(poolId);
    await requireAction(userId, String(pool.workspaceId), "pool.manage");
    const problem = allocationProblem(allocation);
    if (problem) throw new ApiError(400, "invalid_request", problem);
    const members = new Set((await WorkspaceMember.find({ workspaceId: pool.workspaceId, userId: { $in: allocation.shares.map((s) => oid(s.userId)) } }).select("userId").lean()).map((m) => String(m.userId)));
    if (allocation.shares.some((s) => !members.has(s.userId))) throw new ApiError(400, "invalid_request", "Everyone sharing it has to be in the workspace");
    pool.set({
      allocationMode: allocation.mode,
      allocationTargetMinor: allocation.targetMinor,
      allocationShares: allocation.mode === "none" ? [] : allocation.shares.map((s) => ({ userId: oid(s.userId), value: s.value })),
    });
    await pool.save();
  });
}

/** Reminds everyone still short of their share what they owe. */
export function remindContributors(userId: string, poolId: string) {
  return withDb(async () => {
    const pool = await requirePool(poolId);
    const workspaceId = String(pool.workspaceId);
    await requireAction(userId, workspaceId, "pool.manage");
    const funding = await poolFunding(userId, poolId);
    const behind = funding.standings.filter((s) => (s.owesMinor ?? 0) > 0 && s.userId !== userId);
    const currency = await baseCurrencyOf(pool.workspaceId);
    for (const s of behind) {
      await notifyUsers({
        userIds: [s.userId],
        workspaceId,
        kind: "pool.contribution",
        title: `Your share of ${pool.name}`,
        body: `${formatMoney(s.owesMinor!, currency)} still to put in, of ${formatMoney(s.expectedMinor!, currency)}.`,
        href: `/w/${workspaceId}/pools/${String(pool._id)}`,
      });
    }
    return { reminded: behind.length };
  });
}
