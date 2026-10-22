import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel, Category, Transaction as TransactionModel, Workspace } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { baseConverter, entriesByAccount } from "@/src/server/net-worth";
import { balancesOn, type DatedEntry } from "@/src/core/net-worth";
import { addDays, availableToSpend, projectAccount, unassignedEffect } from "@/src/core/projection";
import { dueOccurrences } from "@/src/core/recurrence/next";
import type { AccountKind } from "@/src/core/accounts";
import type { RecurrenceFrequency } from "@/src/core/models/enums";
import type { Projection, UpcomingItem } from "@/src/core/sync/types";

const MAX_OCCURRENCES = 400;

/**
 * Recurring rules' occurrences after the last one posted (even if since
 * deleted, as the engine counts them) through `through`. Ones already due
 * but not yet posted count as upcoming: they aren't in any balance yet.
 */
async function upcomingRecurring(workspaceId: Types.ObjectId, through: string): Promise<UpcomingItem[]> {
  const templates = await TransactionModel.find({
    workspaceId,
    isRecurring: true,
    recurringParentId: null,
    deletedAt: null,
    recurrence: { $ne: null },
  }).lean();
  if (!templates.length) return [];
  const latest = await TransactionModel.aggregate<{ _id: Types.ObjectId; date: Date }>([
    { $match: { recurringParentId: { $in: templates.map((t) => t._id) } } },
    { $group: { _id: "$recurringParentId", date: { $max: "$date" } } },
  ]);
  const lastPosted = new Map(latest.map((row) => [String(row._id), row.date]));
  const end = new Date(`${through}T12:00:00.000Z`);
  return templates.flatMap((template) => {
    const rule = template.recurrence!;
    const dates = dueOccurrences(
      lastPosted.get(String(template._id)) ?? template.date,
      {
        frequency: rule.frequency as RecurrenceFrequency,
        interval: rule.interval,
        // As in the engine: monthly rules keep the template's day.
        byMonthDay: rule.byMonthDay ?? (rule.frequency === "monthly" ? template.date.getUTCDate() : undefined),
        until: rule.until,
      },
      end,
      MAX_OCCURRENCES,
    );
    return dates.map((date) => ({
      date: date.toISOString().slice(0, 10),
      label: template.note ?? "",
      type: template.type,
      amountMinor: template.amountMinor,
      currency: template.currency,
      accountId: template.accountId ? String(template.accountId) : null,
      toAccountId: template.toAccountId ? String(template.toAccountId) : null,
      toAmountMinor: template.toAmountMinor ?? null,
      categoryId: template.categoryId ? String(template.categoryId) : null,
      recurring: true,
    }));
  });
}

/** Transactions already entered with a date after today and on or before `through`. */
async function scheduled(workspaceId: Types.ObjectId, today: string, through: string): Promise<UpcomingItem[]> {
  const docs = await TransactionModel.find({
    workspaceId,
    deletedAt: null,
    isPosted: true,
    date: { $gt: new Date(`${today}T23:59:59.999Z`), $lte: new Date(`${through}T23:59:59.999Z`) },
  }).lean();
  return docs.map((doc) => ({
    date: doc.date.toISOString().slice(0, 10),
    label: doc.note ?? "",
    type: doc.type,
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    accountId: doc.accountId ? String(doc.accountId) : null,
    toAccountId: doc.toAccountId ? String(doc.toAccountId) : null,
    toAmountMinor: doc.toAmountMinor ?? null,
    categoryId: doc.categoryId ? String(doc.categoryId) : null,
    recurring: false,
  }));
}

/**
 * Where each open account is heading over the next `days` days from what's
 * already known (future-dated transactions and upcoming recurring ones), and
 * what's available to spend by then in the base currency.
 */
export function getProjection(userId: string, workspaceId: string, days = 30): Promise<Projection> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const workspace = await Workspace.findById(new Types.ObjectId(workspaceId)).select("baseCurrency").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const base = workspace.baseCurrency;
    const today = new Date().toISOString().slice(0, 10);
    const through = addDays(today, days);

    const accounts = await AccountModel.find({ workspaceId: workspace._id, archivedAt: null }).sort({ createdAt: 1 }).lean();
    const [entries, toBase, recurring, dated, categories] = await Promise.all([
      entriesByAccount(accounts.map((a) => a._id)),
      baseConverter(workspace._id, base),
      upcomingRecurring(workspace._id, through),
      scheduled(workspace._id, today, through),
      Category.find({ workspaceId: workspace._id }).select("name").lean(),
    ]);
    const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
    const upcoming = [...dated, ...recurring]
      .map((item) => ({ ...item, label: item.label || (item.categoryId ? categoryName.get(item.categoryId) ?? "" : "") }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));

    // Each upcoming item, as money in or out of the accounts it names.
    const flows = new Map<string, DatedEntry[]>();
    const flow = (accountId: string, entry: DatedEntry) => flows.set(accountId, [...(flows.get(accountId) ?? []), entry]);
    let unassignedBaseMinor = 0;
    const missing = new Set<string>();
    for (const item of upcoming) {
      if (item.type === "transfer") {
        if (item.accountId) flow(item.accountId, { date: item.date, type: "transfer_out", amountMinor: item.amountMinor });
        if (item.toAccountId) flow(item.toAccountId, { date: item.date, type: "transfer_in", amountMinor: item.toAmountMinor ?? item.amountMinor });
      } else if (item.accountId) {
        flow(item.accountId, { date: item.date, type: item.type, amountMinor: item.amountMinor });
      } else {
        const converted = toBase(unassignedEffect(item.type, item.amountMinor), item.currency, today);
        if (converted == null) missing.add(item.currency);
        else unassignedBaseMinor += converted;
      }
    }

    const rows = accounts.map((account) => {
      const kind = account.kind as AccountKind;
      // Today's balance leaves out future-dated entries; they're among the upcoming flows.
      const todayMinor =
        balancesOn(
          { kind, openingMinor: account.openingBalanceMinor, openingDate: account.openingDate.toISOString().slice(0, 10) },
          entries.get(String(account._id)) ?? [],
          [today],
        )[0] ?? 0;
      const projection = projectAccount(kind, todayMinor, flows.get(String(account._id)) ?? []);
      const projectedBaseMinor = toBase(projection.projectedMinor, account.currency, today);
      if (projectedBaseMinor == null) missing.add(account.currency);
      return {
        id: String(account._id),
        name: account.name,
        kind,
        currency: account.currency,
        todayMinor,
        ...projection,
        projectedBaseMinor,
      };
    });

    return {
      baseCurrency: base,
      from: today,
      through,
      availableToSpendMinor: availableToSpend(
        rows.flatMap((row) => (row.projectedBaseMinor == null ? [] : [{ kind: row.kind, projectedBaseMinor: row.projectedBaseMinor }])),
        unassignedBaseMinor,
      ),
      accounts: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        currency: row.currency,
        todayMinor: row.todayMinor,
        projectedMinor: row.projectedMinor,
        lowestMinor: row.lowestMinor,
        lowestDate: row.lowestDate,
      })),
      upcoming,
      missingRates: [...missing].sort(),
    };
  });
}
