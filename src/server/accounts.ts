import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel, Transaction as TransactionModel, type AccountDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { accountBalance, checkTransfer, type AccountKind, type BalanceEntry } from "@/src/core/accounts";
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

type Totals = { entries: BalanceEntry[]; count: number };

/** Posted, live transactions per account, summed by type; a transfer counts out of one account and into the other. */
async function totals(accountIds: Types.ObjectId[]) {
  const byAccount = new Map<string, Totals>();
  if (!accountIds.length) return byAccount;
  const live = { deletedAt: null, isPosted: true };
  const [out, incoming] = await Promise.all([
    TransactionModel.aggregate<{ _id: { accountId: Types.ObjectId; type: TransactionType }; amountMinor: number; count: number }>([
      { $match: { accountId: { $in: accountIds }, ...live } },
      { $group: { _id: { accountId: "$accountId", type: "$type" }, amountMinor: { $sum: "$amountMinor" }, count: { $sum: 1 } } },
    ]),
    TransactionModel.aggregate<{ _id: Types.ObjectId; amountMinor: number; count: number }>([
      { $match: { toAccountId: { $in: accountIds }, type: "transfer", ...live } },
      { $group: { _id: "$toAccountId", amountMinor: { $sum: "$toAmountMinor" }, count: { $sum: 1 } } },
    ]),
  ]);
  const add = (id: Types.ObjectId, type: BalanceEntry["type"], amountMinor: number, count: number) => {
    const entry = byAccount.get(String(id)) ?? { entries: [], count: 0 };
    entry.entries.push({ type, amountMinor });
    entry.count += count;
    byAccount.set(String(id), entry);
  };
  for (const row of out) add(row._id.accountId, row._id.type === "transfer" ? "transfer_out" : row._id.type, row.amountMinor, row.count);
  for (const row of incoming) add(row._id, "transfer_in", row.amountMinor, row.count);
  return byAccount;
}

/** Any live transaction in or out of the account. */
function usedBy(accountId: Types.ObjectId) {
  return TransactionModel.exists({ $or: [{ accountId }, { toAccountId: accountId }], deletedAt: null });
}

function map(doc: AccountDocument, total?: Totals): Account {
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
    const used = await usedBy(doc._id);
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
    if (await usedBy(doc._id)) {
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

/**
 * For transfers: the account the money goes to (in this workspace, and open
 * unless the transfer already used it) and what it receives in that account's
 * currency. A transfer naming neither account is the older kind that moves no
 * balances. Other types have no "to" side.
 */
export async function resolveTransfer(
  workspaceId: Types.ObjectId,
  input: {
    type: TransactionType;
    accountId?: string | null;
    currency: string;
    amountMinor: number;
    toAccountId?: string | null;
    toAmountMinor?: number | null;
    /** When editing: kept for a cross-currency transfer if no new amount received is given. */
    previousToAmountMinor?: number | null;
  },
  keepToAccountId?: string | null,
): Promise<{ toAccountId: Types.ObjectId | null; toAmountMinor: number | null }> {
  if (input.type !== "transfer") {
    if (input.toAccountId) throw new ApiError(400, "invalid_request", "Only a transfer goes to another account");
    return { toAccountId: null, toAmountMinor: null };
  }
  if (!input.accountId && !input.toAccountId) return { toAccountId: null, toAmountMinor: null };
  let to: { id: string; currency: string } | null = null;
  if (input.toAccountId) {
    const account = await AccountModel.findOne({ _id: oid(input.toAccountId), workspaceId }).select("currency archivedAt").lean();
    if (!account) throw new ApiError(400, "invalid_request", "The account to transfer to is not in this workspace");
    if (account.archivedAt && String(keepToAccountId) !== input.toAccountId) throw new ApiError(400, "invalid_request", "The account to transfer to is archived");
    to = { id: input.toAccountId, currency: account.currency };
  }
  const from = input.accountId ? { id: input.accountId, currency: input.currency.toUpperCase() } : null;
  const crossCurrency = Boolean(from && to && from.currency !== to.currency);
  const result = checkTransfer({
    from,
    to,
    amountMinor: input.amountMinor,
    toAmountMinor: input.toAmountMinor !== undefined ? input.toAmountMinor : crossCurrency ? input.previousToAmountMinor : null,
  });
  if (!result.ok) throw new ApiError(400, "invalid_request", result.error);
  return { toAccountId: oid(to!.id), toAmountMinor: result.toAmountMinor };
}
