import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Category as CategoryModel, EnvelopeMove, Transaction as TransactionModel, Workspace } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { listAccounts } from "@/src/server/accounts";
import { baseConverter } from "@/src/server/net-worth";
import { isLiability } from "@/src/core/accounts";
import { topLevelOf } from "@/src/core/categories";
import { checkMove, envelopeBalance, readyToAssign } from "@/src/core/envelopes";
import type { EnvelopeState } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** Income and Transfer are system categories that money doesn't get spent from. */
const NOT_ENVELOPES = new Set(["Income", "Transfer"]);

/** Spending (expenses less refunds) per category since a date, split lines in their own categories. */
async function spentByCategory(workspaceId: Types.ObjectId, since: Date) {
  const rows = await TransactionModel.aggregate<{ _id: Types.ObjectId | null; total: number }>([
    { $match: { workspaceId, isPosted: true, deletedAt: null, date: { $gte: since }, type: { $in: ["expense", "refund"] } } },
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
  ]);
  return rows;
}

async function computeState(userId: string, workspaceId: string): Promise<EnvelopeState> {
  const workspace = await Workspace.findById(oid(workspaceId)).select("baseCurrency envelopesSince").lean();
  if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
  const base = workspace.baseCurrency;
  if (!workspace.envelopesSince) {
    return { started: false, since: null, baseCurrency: base, readyToAssignMinor: 0, cashMinor: 0, cardDebtMinor: 0, uncategorizedSpentMinor: 0, envelopes: [], missingRates: [] };
  }
  const since = workspace.envelopesSince;
  const today = new Date().toISOString().slice(0, 10);
  const [accounts, toBase, categories, moves, spent] = await Promise.all([
    listAccounts(userId, workspaceId),
    baseConverter(workspace._id, base),
    CategoryModel.find({ workspaceId: workspace._id, deletedAt: null, archivedAt: null }).select("name parentId isSystem").lean(),
    EnvelopeMove.find({ workspaceId: workspace._id }).select("fromCategoryId toCategoryId amountMinor").lean(),
    spentByCategory(workspace._id, since),
  ]);

  // Cash on hand and card debt today, in base currency.
  let cashMinor = 0;
  let cardDebtMinor = 0;
  const missing = new Set<string>();
  for (const account of accounts) {
    if (account.kind === "loan") continue;
    const converted = toBase(account.balanceMinor, account.currency, today);
    if (converted == null) {
      missing.add(account.currency);
      continue;
    }
    if (isLiability(account.kind)) cardDebtMinor += converted;
    else cashMinor += converted;
  }

  const nodes = categories.map((c) => ({ id: String(c._id), name: c.name, parentId: c.parentId ? String(c.parentId) : null }));
  const envelopeIds = nodes
    .filter((c) => topLevelOf(c.id, nodes) === c.id)
    .filter((c) => !(categories.find((d) => String(d._id) === c.id)?.isSystem && NOT_ENVELOPES.has(c.name)))
    .map((c) => c.id);
  const funded = new Map<string, number>();
  for (const move of moves) {
    if (move.toCategoryId) funded.set(String(move.toCategoryId), (funded.get(String(move.toCategoryId)) ?? 0) + move.amountMinor);
    if (move.fromCategoryId) funded.set(String(move.fromCategoryId), (funded.get(String(move.fromCategoryId)) ?? 0) - move.amountMinor);
  }
  const spentIn = new Map<string, number>();
  let uncategorizedSpentMinor = 0;
  for (const row of spent) {
    // Spending in a subcategory comes out of its parent's envelope.
    const top = row._id ? topLevelOf(String(row._id), nodes) : null;
    if (top && envelopeIds.includes(top)) spentIn.set(top, (spentIn.get(top) ?? 0) + row.total);
    else uncategorizedSpentMinor += row.total;
  }
  const envelopes = envelopeIds.map((categoryId) => {
    const fundedMinor = funded.get(categoryId) ?? 0;
    const spentMinor = spentIn.get(categoryId) ?? 0;
    return { categoryId, fundedMinor, spentMinor, balanceMinor: envelopeBalance(fundedMinor, spentMinor) };
  });
  return {
    started: true,
    since: since.toISOString().slice(0, 10),
    baseCurrency: base,
    readyToAssignMinor: readyToAssign({ cashMinor, cardDebtMinor, envelopeBalancesMinor: envelopes.map((e) => e.balanceMinor) }),
    cashMinor,
    cardDebtMinor,
    uncategorizedSpentMinor,
    envelopes,
    missingRates: [...missing].sort(),
  };
}

/** The workspace's envelopes and what's ready to assign. Anyone in it can see them. */
export function getEnvelopes(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    return computeState(userId, workspaceId);
  });
}

/** Starts envelopes from a day: spending before it doesn't come out of any envelope. */
export function startEnvelopes(userId: string, workspaceId: string, since: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    await Workspace.updateOne({ _id: oid(workspaceId) }, { $set: { envelopesSince: new Date(`${since}T00:00:00.000Z`) } });
    return computeState(userId, workspaceId);
  });
}

/** Moves money between envelopes, or to and from Ready to assign (null). */
export function moveEnvelopeMoney(
  userId: string,
  workspaceId: string,
  input: { fromCategoryId: string | null; toCategoryId: string | null; amountMinor: number; note?: string | null },
) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const state = await computeState(userId, workspaceId);
    if (!state.started) throw new ApiError(409, "envelopes_not_started", "Start envelopes first");
    const envelope = (id: string | null) => (id ? state.envelopes.find((e) => e.categoryId === id) : undefined);
    for (const id of [input.fromCategoryId, input.toCategoryId]) {
      if (id && !envelope(id)) throw new ApiError(400, "invalid_request", "That isn't one of this workspace's envelopes");
    }
    const result = checkMove({
      fromId: input.fromCategoryId,
      toId: input.toCategoryId,
      amountMinor: input.amountMinor,
      availableMinor: input.fromCategoryId ? envelope(input.fromCategoryId)!.balanceMinor : state.readyToAssignMinor,
    });
    if (!result.ok) throw new ApiError(400, "invalid_request", result.error);
    await EnvelopeMove.create({
      workspaceId: oid(workspaceId),
      fromCategoryId: input.fromCategoryId ? oid(input.fromCategoryId) : null,
      toCategoryId: input.toCategoryId ? oid(input.toCategoryId) : null,
      amountMinor: input.amountMinor,
      note: input.note?.trim() || null,
      createdById: oid(userId),
    });
    return computeState(userId, workspaceId);
  });
}

/** The latest moves, newest first, for looking back at what went where. */
export function listEnvelopeMoves(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const moves = await EnvelopeMove.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: -1 }).limit(30).lean();
    return moves.map((move) => ({
      id: String(move._id),
      fromCategoryId: move.fromCategoryId ? String(move.fromCategoryId) : null,
      toCategoryId: move.toCategoryId ? String(move.toCategoryId) : null,
      amountMinor: move.amountMinor,
      note: move.note ?? null,
      createdAt: move.createdAt.toISOString(),
    }));
  });
}
