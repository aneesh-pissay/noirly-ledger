import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Transaction as TransactionModel } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { bulkSummary, patchFor, type BulkChange } from "@/src/core/bulk";
import type { CreateTransactionInput, LedgerSyncProvider, Transaction } from "@/src/core/sync/types";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Couldn't change it";
}

/**
 * Changes or deletes each selected transaction in turn through the usual
 * one-at-a-time rules, so whatever a single edit wouldn't allow is reported
 * for that transaction and the rest still go through. Every id must be one of
 * this workspace's transactions.
 */
export async function bulkChangeTransactions(
  sync: LedgerSyncProvider,
  userId: string,
  workspaceId: string,
  ids: string[],
  action: { kind: "delete" } | { kind: "update"; change: BulkChange },
) {
  await withDb(() => requireMembershipRole(userId, workspaceId));
  const unique = [...new Set(ids)];
  const valid = unique.filter((id) => Types.ObjectId.isValid(id));
  const inWorkspace = await withDb(async () => {
    const docs = await TransactionModel.find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) }, workspaceId: new Types.ObjectId(workspaceId), deletedAt: null })
      .select("_id")
      .lean();
    return new Set(docs.map((d) => String(d._id)));
  });
  const results: Array<{ id: string; error: string | null }> = [];
  for (const id of unique) {
    if (!inWorkspace.has(id)) {
      results.push({ id, error: "Not one of this workspace's transactions" });
      continue;
    }
    try {
      if (action.kind === "delete") {
        await sync.deleteTransaction(id);
      } else {
        const current = await sync.getTransaction(id);
        const patch = patchFor(action.change, current.tags);
        if (Object.keys(patch).length) await sync.updateTransaction(id, patch);
      }
      results.push({ id, error: null });
    } catch (error) {
      results.push({ id, error: message(error) });
    }
  }
  return bulkSummary(results);
}

/**
 * Adds several transactions, all or nothing: if any can't be added, the ones
 * already added in this run are taken out again and the error names the row.
 */
export async function bulkCreateTransactions(sync: LedgerSyncProvider, inputs: CreateTransactionInput[]) {
  const created: Transaction[] = [];
  for (const [index, input] of inputs.entries()) {
    try {
      created.push(await sync.createTransaction(input));
    } catch (error) {
      if (created.length) {
        await withDb(() => TransactionModel.deleteMany({ _id: { $in: created.map((t) => new Types.ObjectId(t.id)) } }));
      }
      const status = error instanceof ApiError ? error.status : 400;
      throw new ApiError(status === 500 ? 500 : 400, "invalid_request", `Row ${index + 1}: ${message(error)}. Nothing was added.`);
    }
  }
  return created;
}
