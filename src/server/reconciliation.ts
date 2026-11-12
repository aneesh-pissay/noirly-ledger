import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account, LedgerUser, Reconciliation, Transaction } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { accountBalance, type AccountKind, type BalanceEntry } from "@/src/core/accounts";
import { reconStatus, stalePendingBefore, type AccountReconView, type ReconciliationView, type ReconReport } from "@/src/core/reconciliation";

const HISTORY = 100;

function oid(id: string | Types.ObjectId) {
  if (!Types.ObjectId.isValid(String(id))) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(String(id));
}

const day = (date: Date) => date.toISOString().slice(0, 10);
const endOf = (isoDay: string) => new Date(`${isoDay}T23:59:59.999Z`);

/** Live, posted transactions in or out of the account that match `match`, as balance entries. */
async function entriesOf(accountId: Types.ObjectId, match: Record<string, unknown>): Promise<BalanceEntry[]> {
  const live = { deletedAt: null, isPosted: true, ...match };
  const [out, incoming] = await Promise.all([
    Transaction.aggregate<{ _id: string; amountMinor: number }>([
      { $match: { accountId, ...live } },
      { $group: { _id: "$type", amountMinor: { $sum: "$amountMinor" } } },
    ]),
    Transaction.aggregate<{ amountMinor: number }>([
      { $match: { toAccountId: accountId, type: "transfer", ...live } },
      { $group: { _id: null, amountMinor: { $sum: { $ifNull: ["$toAmountMinor", "$amountMinor"] } } } },
    ]),
  ]);
  return [
    ...out.map((row) => ({ type: (row._id === "transfer" ? "transfer_out" : row._id) as BalanceEntry["type"], amountMinor: row.amountMinor })),
    ...incoming.map((row) => ({ type: "transfer_in" as const, amountMinor: row.amountMinor })),
  ];
}

const either = (accountId: Types.ObjectId) => ({ $or: [{ accountId }, { toAccountId: accountId }], deletedAt: null, isPosted: true });

/**
 * Every account's reconciliation standing, and the reconciliations made,
 * newest first. Anyone in the workspace can see it, as they can the accounts.
 */
export function reconciliationReport(userId: string, workspaceId: string, today = day(new Date())) {
  return withDb(async (): Promise<ReconReport> => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const accounts = await Account.find({ workspaceId: ws }).sort({ archivedAt: 1, createdAt: 1 }).lean();
    const staleBefore = new Date(`${stalePendingBefore(today)}T00:00:00.000Z`);

    const rows = await Promise.all(
      accounts.map(async (account): Promise<AccountReconView> => {
        const through = account.reconciledThrough ? day(account.reconciledThrough) : null;
        const [reconciled, lateCount, unreconciledCount, pendingCount, stalePendingCount, oldest] = await Promise.all([
          through ? entriesOf(account._id, { clearing: "reconciled" }) : Promise.resolve(null),
          through ? Transaction.countDocuments({ ...either(account._id), clearing: { $in: ["cleared", null] }, date: { $lte: endOf(through) } }) : Promise.resolve(0),
          Transaction.countDocuments({ ...either(account._id), clearing: { $in: ["cleared", null] }, date: { $lte: endOf(today) } }),
          Transaction.countDocuments({ ...either(account._id), clearing: "pending", date: { $lte: endOf(today) } }),
          Transaction.countDocuments({ ...either(account._id), clearing: "pending", date: { $lt: staleBefore } }),
          Transaction.findOne({ ...either(account._id), clearing: "pending" }).sort({ date: 1 }).select("date").lean(),
        ]);
        const reconciledNowMinor = reconciled ? accountBalance(account.kind as AccountKind, account.openingBalanceMinor, reconciled) : null;
        const input = { reconciledThrough: through, reconciledBalanceMinor: account.reconciledBalanceMinor ?? null, reconciledNowMinor, lateCount };
        return {
          accountId: String(account._id),
          name: account.name,
          kind: account.kind,
          currency: account.currency,
          archived: Boolean(account.archivedAt),
          ...input,
          ...reconStatus(input, today),
          unreconciledCount,
          pendingCount,
          stalePendingCount,
          oldestPending: oldest ? day(oldest.date) : null,
        };
      }),
    );

    const made = await Reconciliation.find({ workspaceId: ws }).sort({ createdAt: -1 }).limit(HISTORY).lean();
    const names = new Map(accounts.map((a) => [String(a._id), a.name]));
    const people = await LedgerUser.find({ _id: { $in: [...new Set(made.map((r) => String(r.userId)))].map(oid) } }).select("displayName").lean();
    const personName = new Map(people.map((p) => [String(p._id), p.displayName]));
    const history: ReconciliationView[] = made.map((r) => ({
      id: String(r._id),
      accountId: String(r.accountId),
      accountName: names.get(String(r.accountId)) ?? "(deleted account)",
      currency: r.currency,
      through: day(r.through),
      statementMinor: r.statementMinor,
      transactionCount: r.transactionCount,
      by: personName.get(String(r.userId)) ?? null,
      at: r.createdAt.toISOString(),
    }));
    // Active accounts first, the ones needing a look at the top.
    const order = { drift: 0, due: 1, never: 2, ok: 3 } as const;
    rows.sort((a, b) => Number(a.archived) - Number(b.archived) || order[a.status] - order[b.status]);
    return { asOf: today, accounts: rows, history };
  });
}
