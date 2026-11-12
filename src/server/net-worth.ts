import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel, FxRate, Transaction as TransactionModel, Workspace } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { convertToBaseMinor, FX_RATE_SCALE } from "@/src/core/money";
import { balancesOn, historyDays, netWorth, type DatedEntry } from "@/src/core/net-worth";
import type { AccountKind } from "@/src/core/accounts";
import type { TransactionType } from "@/src/core/models/enums";
import type { NetWorth } from "@/src/core/sync/types";

const DAY = { $dateToString: { format: "%Y-%m-%d", date: "$date" } };

/** Every account's posted, live money in and out, summed per day. */
export async function entriesByAccount(accountIds: Types.ObjectId[]) {
  const live = { deletedAt: null, isPosted: true };
  const [out, incoming] = await Promise.all([
    TransactionModel.aggregate<{ _id: { accountId: Types.ObjectId; type: TransactionType; date: string }; amountMinor: number }>([
      { $match: { accountId: { $in: accountIds }, ...live } },
      { $group: { _id: { accountId: "$accountId", type: "$type", date: DAY }, amountMinor: { $sum: "$amountMinor" } } },
    ]),
    TransactionModel.aggregate<{ _id: { accountId: Types.ObjectId; date: string }; amountMinor: number }>([
      { $match: { toAccountId: { $in: accountIds }, type: "transfer", ...live } },
      { $group: { _id: { accountId: "$toAccountId", date: DAY }, amountMinor: { $sum: "$toAmountMinor" } } },
    ]),
  ]);
  const byAccount = new Map<string, DatedEntry[]>();
  const add = (id: Types.ObjectId, entry: DatedEntry) => {
    const list = byAccount.get(String(id)) ?? [];
    list.push(entry);
    byAccount.set(String(id), list);
  };
  for (const row of out) {
    add(row._id.accountId, { date: row._id.date, type: row._id.type === "transfer" ? "transfer_out" : row._id.type, amountMinor: row.amountMinor });
  }
  for (const row of incoming) add(row._id.accountId, { date: row._id.date, type: "transfer_in", amountMinor: row.amountMinor });
  return byAccount;
}

/**
 * Converts amounts to the base currency at the rate in force on a day (the
 * newest on or before it, as in toBaseAmount), or null when there's none yet.
 * Loads the workspace's rates once.
 */
export async function baseConverter(workspaceId: Types.ObjectId, base: string) {
  const rates = await FxRate.find({ workspaceId }).sort({ effectiveFrom: 1 }).select("currency rateToBaseScaled effectiveFrom").lean();
  return (minor: number, currency: string, day: string) => {
    if (currency === base) return minor;
    let found: number | null = null;
    for (const rate of rates) {
      if (rate.currency !== currency) continue;
      if (rate.effectiveFrom.toISOString().slice(0, 10) > day) break;
      found = rate.rateToBaseScaled;
    }
    return found == null ? null : convertToBaseMinor(minor, found, FX_RATE_SCALE);
  };
}

/**
 * What the workspace has and owes across its accounts, in the base currency,
 * now and at the end of each of the last `months` months. Each balance uses
 * the FX rate in force on its day; an account is left out of the days before
 * its currency has a rate, and listed in missingRates if that includes today.
 */
export function getNetWorth(userId: string, workspaceId: string, months = 12): Promise<NetWorth> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const workspace = await Workspace.findById(new Types.ObjectId(workspaceId)).select("baseCurrency").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const base = workspace.baseCurrency;
    const accounts = await AccountModel.find({ workspaceId: workspace._id }).sort({ createdAt: 1 }).lean();
    const toBase = await baseConverter(workspace._id, base);
    const entries = await entriesByAccount(accounts.map((a) => a._id));

    const days = historyDays(new Date().toISOString().slice(0, 10), months);

    const missing = new Set<string>();
    const rows = accounts.map((account) => {
      const kind = account.kind as AccountKind;
      const balances = balancesOn(
        { kind, openingMinor: account.openingBalanceMinor, openingDate: account.openingDate.toISOString().slice(0, 10) },
        entries.get(String(account._id)) ?? [],
        days,
      );
      const baseBalances = balances.map((balance, i) => {
        if (balance == null) return 0;
        const converted = toBase(balance, account.currency, days[i]!);
        // Earlier months may predate the first rate; only today's gap is worth flagging.
        if (converted == null && i === days.length - 1) missing.add(account.currency);
        return converted;
      });
      return { account, kind, balanceMinor: balances.at(-1) ?? 0, baseBalances };
    });

    // An account counts only on the days its currency has a rate.
    const at = (i: number) =>
      netWorth(rows.flatMap((row) => (row.baseBalances[i] == null ? [] : [{ kind: row.kind, baseBalanceMinor: row.baseBalances[i]! }])));
    const last = days.length - 1;
    return {
      baseCurrency: base,
      ...at(last),
      accounts: rows.map((row) => ({
        id: String(row.account._id),
        name: row.account.name,
        kind: row.kind,
        currency: row.account.currency,
        archived: Boolean(row.account.archivedAt),
        balanceMinor: row.balanceMinor,
        baseBalanceMinor: row.baseBalances[last] ?? null,
      })),
      history: days.map((date, i) => ({ date, ...at(i) })),
      missingRates: [...missing].sort(),
    };
  });
}
