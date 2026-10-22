import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel, Transaction as TransactionModel, type AccountDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { accountBalance, type AccountKind } from "@/src/core/accounts";
import type { TransactionType } from "@/src/core/models/enums";
import type { Account } from "@/src/core/sync/types";

/** A malformed id is the caller's mistake (400), not a server error. */
function oid(id: string | Types.ObjectId) {
  if (!Types.ObjectId.isValid(String(id))) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(String(id));
}
const MAX_ACCOUNTS = 50;

export type AccountInput = {
  name: string;
  kind: AccountKind;
  currency: string;
  openingBalanceMinor: number;
  openingDate: string;
  institution?: string | null;
};

export type AccountPatch = Partial<Omit<AccountInput, "kind" | "currency">> & { kind?: AccountKind; currency?: string; archived?: boolean };

function day(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Posted, live transactions per account, summed by type. */
async function totals(accountIds: Types.ObjectId[]) {
  if (!accountIds.length) return new Map<string, { entries: Array<{ type: TransactionType; amountMinor: number }>; count: number }>();
  const rows = await TransactionModel.aggregate<{ _id: { accountId: Types.ObjectId; type: TransactionType }; amountMinor: number; count: number }>([
    { $match: { accountId: { $in: accountIds }, deletedAt: null, isPosted: true } },
    { $group: { _id: { accountId: "$accountId", type: "$type" }, amountMinor: { $sum: "$amountMinor" }, count: { $sum: 1 } } },
  ]);
  const byAccount = new Map<string, { entries: Array<{ type: TransactionType; amountMinor: number }>; count: number }>();
  for (const row of rows) {
    const key = String(row._id.accountId);
    const entry = byAccount.get(key) ?? { entries: [], count: 0 };
    entry.entries.push({ type: row._id.type, amountMinor: row.amountMinor });
    entry.count += row.count;
    byAccount.set(key, entry);
  }
  return byAccount;
}

function map(doc: AccountDocument, total?: { entries: Array<{ type: TransactionType; amountMinor: number }>; count: number }): Account {
  const kind = doc.kind as AccountKind;
  return {
    id: String(doc._id),
    workspaceId: String(doc.workspaceId),
    name: doc.name,
    kind,
    currency: doc.currency,
    openingBalanceMinor: doc.openingBalanceMinor,
    openingDate: day(doc.openingDate),
    institution: doc.institution ?? null,
    archived: Boolean(doc.archivedAt),
    balanceMinor: accountBalance(kind, doc.openingBalanceMinor, total?.entries ?? []),
    transactionCount: total?.count ?? 0,
  };
}

async function withBalance(doc: AccountDocument) {
  return map(doc, (await totals([doc._id])).get(String(doc._id)));
}

/** The workspace's accounts with their balances, open ones first. Anyone in it can see them. */
export function listAccounts(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await AccountModel.find({ workspaceId: oid(workspaceId) }).sort({ archivedAt: 1, createdAt: 1 }).lean();
    const sums = await totals(docs.map((d) => d._id));
    return docs.map((doc) => map(doc as AccountDocument, sums.get(String(doc._id))));
  });
}

/** Accounts shape everyone's balances, so changing them takes the same role as categories. */
export function createAccount(userId: string, workspaceId: string, input: AccountInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    if (await AccountModel.countDocuments({ workspaceId: oid(workspaceId), archivedAt: null }) >= MAX_ACCOUNTS) {
      throw new ApiError(400, "limit_reached", `A workspace can have up to ${MAX_ACCOUNTS} open accounts.`);
    }
    const doc = await AccountModel.create({
      workspaceId: oid(workspaceId),
      name: input.name,
      kind: input.kind,
      currency: input.currency.toUpperCase(),
      openingBalanceMinor: input.openingBalanceMinor,
      openingDate: new Date(`${input.openingDate}T12:00:00.000Z`),
      institution: input.institution?.trim() || null,
      createdById: oid(userId),
    });
    return map(doc.toObject());
  });
}

async function requireAccount(userId: string, accountId: string) {
  const doc = await AccountModel.findById(oid(accountId));
  if (!doc) throw new ApiError(404, "not_found", "Account not found");
  await requireAction(userId, String(doc.workspaceId), "budget.manage");
  return doc;
}

export function updateAccount(userId: string, accountId: string, patch: AccountPatch) {
  return withDb(async () => {
    const doc = await requireAccount(userId, accountId);
    const used = await TransactionModel.exists({ accountId: doc._id, deletedAt: null });
    // Its transactions are in its currency, and its sign depends on its kind.
    if (used && patch.currency && patch.currency.toUpperCase() !== doc.currency) {
      throw new ApiError(409, "account_in_use", "An account with transactions can't change currency");
    }
    if (used && patch.kind && (patch.kind === "credit_card" || patch.kind === "loan") !== (doc.kind === "credit_card" || doc.kind === "loan")) {
      throw new ApiError(409, "account_in_use", "An account with transactions can't switch between money you have and money you owe");
    }
    if (patch.name !== undefined) doc.name = patch.name;
    if (patch.kind !== undefined) doc.kind = patch.kind;
    if (patch.currency !== undefined) doc.currency = patch.currency.toUpperCase();
    if (patch.openingBalanceMinor !== undefined) doc.openingBalanceMinor = patch.openingBalanceMinor;
    if (patch.openingDate !== undefined) doc.openingDate = new Date(`${patch.openingDate}T12:00:00.000Z`);
    if (patch.institution !== undefined) doc.institution = patch.institution?.trim() || null;
    if (patch.archived !== undefined) doc.archivedAt = patch.archived ? doc.archivedAt ?? new Date() : null;
    await doc.save();
    return withBalance(doc.toObject());
  });
}

/** Only an account nothing points at can go; otherwise archive it. */
export function deleteAccount(userId: string, accountId: string) {
  return withDb(async () => {
    const doc = await requireAccount(userId, accountId);
    if (await TransactionModel.exists({ accountId: doc._id, deletedAt: null })) {
      throw new ApiError(409, "account_in_use", "This account has transactions. Archive it instead.");
    }
    await doc.deleteOne();
  });
}

/**
 * For transactions: the account must be in the workspace and open (unless
 * the transaction already used it), and the amount in the account's currency.
 */
export async function assertTransactionAccount(workspaceId: Types.ObjectId, accountId: string | null | undefined, currency: string, keepAccountId?: string | null) {
  if (!accountId) return;
  const account = await AccountModel.findOne({ _id: oid(accountId), workspaceId }).select("currency archivedAt").lean();
  if (!account) throw new ApiError(400, "invalid_request", "Account is not in this workspace");
  if (account.archivedAt && String(keepAccountId) !== accountId) throw new ApiError(400, "invalid_request", "That account is archived");
  if (account.currency !== currency.toUpperCase()) {
    throw new ApiError(400, "currency_mismatch", `That account is in ${account.currency}; enter the amount in ${account.currency}`);
  }
}
