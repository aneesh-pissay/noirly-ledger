import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { Transaction as TransactionModel } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { netSpentSum } from "@/src/server/projects";
import { ApiError } from "@/src/server/api/http";
import { cleanMerchant, normalizeTags } from "@/src/core/labels";

/** Tags and merchant as stored, or a 400 saying what's wrong with them. */
export function labelFields(input: { tags?: string[] | null; merchant?: string | null }) {
  try {
    const merchant = input.merchant === undefined ? undefined : cleanMerchant(input.merchant);
    return {
      ...(input.tags === undefined ? {} : { tags: normalizeTags(input.tags ?? []) }),
      ...(merchant === undefined ? {} : { merchant, merchantKey: merchant ? merchant.toLowerCase() : null }),
    };
  } catch (error) {
    throw new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Invalid labels");
  }
}

const live = { deletedAt: null, isPosted: true };

/** The workspace's tags, most used first, for suggestions and browsing. */
export function listTags(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const rows = await TransactionModel.aggregate<{ _id: string; count: number }>([
      { $match: { workspaceId: new Types.ObjectId(workspaceId), ...live, "tags.0": { $exists: true } } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 200 },
    ]);
    return rows.map((row) => ({ tag: row._id, count: row.count }));
  });
}

/**
 * The workspace's merchants, most used first: the latest spelling of each
 * name, how often it appears and what was spent there in base currency.
 */
export function listMerchants(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const rows = await TransactionModel.aggregate<{ _id: string; name: string; count: number; spentMinor: number }>([
      { $match: { workspaceId: new Types.ObjectId(workspaceId), ...live, merchantKey: { $ne: null } } },
      { $sort: { date: -1 } },
      { $group: { _id: "$merchantKey", name: { $first: "$merchant" }, count: { $sum: 1 }, spentMinor: netSpentSum } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 200 },
    ]);
    return rows.map((row) => ({ key: row._id, name: row.name, count: row.count, spentMinor: row.spentMinor }));
  });
}
