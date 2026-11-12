import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account, Budget, BudgetRevision, Category, Transaction, Workspace } from "@/src/server/models";
import { spentByDay } from "@/src/server/budgets";
import { budgetCategoryIds } from "@/src/server/categories/tree";
import { limitAt } from "@/src/core/budgets/revisions";
import { isoDate } from "@/src/core/budgets/period";
import { budgetSummary, budgetWindows, compareBudget } from "@/src/core/reports/budget-vs-actual";
import type { BudgetPeriod } from "@/src/core/models/enums";
import { trends, yearEarlier } from "@/src/core/reports/trends";
import { debtFreeMonth, debtProgress, netWorthReport, type AccountBalances, type DebtFlow } from "@/src/core/reports/net-worth-report";
import { addDays } from "@/src/core/reports/periods";
import { isLiability } from "@/src/core/accounts";
import { simulateDebts } from "@/src/core/debts";
import { listDebts } from "@/src/server/debts";
import { categoryVariance, earlierStretches, savingsAnalysis, unusualSpending, type SpendTxn } from "@/src/core/reports/insights";
import { UNCATEGORIZED } from "@/src/core/reports/spending";
import { formatMoney } from "@/src/core/locale-format";
import { analyseSpending, previousRange, type SpendLine } from "@/src/core/reports/spending";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { baseConverter, entriesByAccount } from "@/src/server/net-worth";
import { defaultFiscalStart } from "@/src/core/locale-format";
import { balancesOn } from "@/src/core/net-worth";
import { cashEffect, isCash } from "@/src/core/cash-flow";
import { periods, suggestedGranularity, type Granularity } from "@/src/core/reports/periods";
import { cashFlowReport, incomeVsExpense, type CashMove, type DayTotal } from "@/src/core/reports/cash-flow-report";
import type { AccountKind } from "@/src/core/accounts";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

export type ReportQuery = { from: string; to: string; granularity?: Granularity };

const DAY = { $dateToString: { format: "%Y-%m-%d", date: "$date" } };

/** The workspace a report is for, its periods, and who may see it (anyone in it). */
export async function reportScope(userId: string, workspaceId: string, query: ReportQuery) {
  await requireMembershipRole(userId, workspaceId);
  if (query.to < query.from) throw new ApiError(400, "invalid_request", "The range ends before it starts");
  const workspace = await Workspace.findById(oid(workspaceId)).select("baseCurrency fiscalYearStartMonth").lean();
  if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
  const fiscalStart = workspace.fiscalYearStartMonth ?? defaultFiscalStart(workspace.baseCurrency);
  const granularity = query.granularity ?? suggestedGranularity(query.from, query.to);
  return { workspace, fiscalStart, granularity, list: periods(query.from, query.to, granularity, fiscalStart) };
}

/** Income, spending net of refunds and what's left, period by period. Posted transactions only. */
export function incomeExpenseReport(userId: string, workspaceId: string, query: ReportQuery) {
  return withDb(async () => {
    const { workspace, granularity, list } = await reportScope(userId, workspaceId, query);
    const report = incomeVsExpense(await dayTotals(workspace._id, query.from, query.to), list);
    return { baseCurrency: workspace.baseCurrency, granularity, ...report };
  });
}

/**
 * Posted spending between two days, summed per day, category and merchant,
 * refunds taking it back. A split transaction gives one line per category
 * (and counts once in each).
 */
async function spendLines(workspaceId: Types.ObjectId, from: string, to: string): Promise<SpendLine[]> {
  const rows = await Transaction.aggregate<{ _id: { date: string; categoryId: Types.ObjectId | null; merchantKey: string | null }; amountMinor: number; count: number; merchantName: string | null }>([
    {
      $match: {
        workspaceId,
        deletedAt: null,
        isPosted: true,
        type: { $in: ["expense", "refund"] },
        date: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) },
      },
    },
    {
      $project: {
        date: DAY,
        merchantKey: 1,
        merchant: 1,
        sign: { $cond: [{ $eq: ["$type", "refund"] }, -1, 1] },
        isExpense: { $eq: ["$type", "expense"] },
        lines: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$splits", []] } }, 0] },
            "$splits",
            [{ categoryId: "$categoryId", baseAmountMinor: "$baseAmountMinor" }],
          ],
        },
      },
    },
    { $unwind: "$lines" },
    {
      $group: {
        _id: { date: "$date", categoryId: "$lines.categoryId", merchantKey: "$merchantKey" },
        amountMinor: { $sum: { $multiply: ["$sign", "$lines.baseAmountMinor"] } },
        count: { $sum: { $cond: ["$isExpense", 1, 0] } },
        merchantName: { $last: "$merchant" },
      },
    },
  ]);
  return rows.map((r) => ({
    date: r._id.date,
    categoryId: r._id.categoryId ? String(r._id.categoryId) : null,
    merchantKey: r._id.merchantKey ?? null,
    merchantName: r.merchantName ?? null,
    amountMinor: r.amountMinor,
    count: r.count,
  }));
}

/** Where the money went: by category (rolled up) and merchant, against the same number of days just before. */
export function spendingReport(userId: string, workspaceId: string, query: ReportQuery) {
  return withDb(async () => {
    const { workspace, granularity, list } = await reportScope(userId, workspaceId, query);
    const before = previousRange(query.from, query.to);
    const [current, previous, categories] = await Promise.all([
      spendLines(workspace._id, query.from, query.to),
      spendLines(workspace._id, before.from, before.to),
      Category.find({ workspaceId: workspace._id }).select("name color parentId").lean(),
    ]);
    const analysis = analyseSpending({
      current,
      previous,
      categories: categories.map((c) => ({ id: String(c._id), name: c.name, color: c.color, parentId: c.parentId ? String(c.parentId) : null })),
      periods: list,
    });
    return { baseCurrency: workspace.baseCurrency, granularity, previous: before, ...analysis };
  });
}

/**
 * Every budget in its own periods overlapping the range, the limit it had
 * then against what was spent, plus spending in the range that no budget covers.
 */
export function budgetVsActualReport(userId: string, workspaceId: string, query: ReportQuery) {
  return withDb(async () => {
    const { workspace, fiscalStart } = await reportScope(userId, workspaceId, query);
    const [budgets, categories] = await Promise.all([
      Budget.find({ workspaceId: workspace._id }).lean(),
      Category.find({ workspaceId: workspace._id }).select("name").lean(),
    ]);
    const nameOf = new Map(categories.map((c) => [String(c._id), c.name]));
    const revisions = await BudgetRevision.find({ budgetId: { $in: budgets.map((b) => b._id) } }).select("budgetId createdAt previousLimitMinor limitMinor").lean();
    const today = isoDate(new Date());
    const covered = new Map<string, Types.ObjectId>();
    const comparisons = [];
    for (const b of budgets) {
      const windows = budgetWindows(b.period as BudgetPeriod, query.from, query.to, { start: b.periodStart ? isoDate(b.periodStart) : null, end: b.periodEnd ? isoDate(b.periodEnd) : null }, fiscalStart);
      if (!windows.length) continue;
      const ids = await budgetCategoryIds(b.categoryId);
      for (const id of ids) covered.set(String(id), id);
      const byDay = await spentByDay(workspace._id, ids, new Date(`${windows[0]!.from}T00:00:00.000Z`), new Date(`${windows.at(-1)!.to}T23:59:59.999Z`));
      const history = revisions.filter((r) => String(r.budgetId) === String(b._id)).map((r) => ({ at: r.createdAt, previousLimitMinor: r.previousLimitMinor ?? null, limitMinor: r.limitMinor ?? null }));
      comparisons.push(
        compareBudget(
          { budgetId: String(b._id), categoryId: String(b.categoryId), name: nameOf.get(String(b.categoryId)) ?? "Deleted category", period: b.period as BudgetPeriod, alertPct: b.alertThresholdPct },
          // Each period against the limit it had when it ended.
          windows.map((w) => ({ ...w, limitMinor: limitAt(history, new Date(`${w.to}T23:59:59.999Z`), b.limitAmountMinor) })),
          byDay,
          today,
        ),
      );
    }
    const from = new Date(`${query.from}T00:00:00.000Z`);
    const to = new Date(`${query.to}T23:59:59.999Z`);
    const totalSpent = (await spendLines(workspace._id, query.from, query.to)).reduce((s, l) => s + l.amountMinor, 0);
    const coveredSpent = covered.size ? [...(await spentByDay(workspace._id, [...covered.values()], from, to)).values()].reduce((s, v) => s + v, 0) : 0;
    comparisons.sort((a, b) => (b.totals.overCount - a.totals.overCount) || (a.totals.varianceMinor - b.totals.varianceMinor));
    return { baseCurrency: workspace.baseCurrency, budgets: comparisons, summary: budgetSummary(comparisons, totalSpent, coveredSpent) };
  });
}

/** Posted income and spending per day and type, between two days. */
async function dayTotals(workspaceId: Types.ObjectId, from: string, to: string): Promise<DayTotal[]> {
  const days = await Transaction.aggregate<{ _id: { date: string; type: DayTotal["type"] }; amountMinor: number }>([
    {
      $match: {
        workspaceId,
        deletedAt: null,
        isPosted: true,
        type: { $in: ["income", "expense", "refund"] },
        date: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) },
      },
    },
    { $group: { _id: { date: DAY, type: "$type" }, amountMinor: { $sum: "$baseAmountMinor" } } },
  ]);
  return days.map((d) => ({ date: d._id.date, type: d._id.type, amountMinor: d.amountMinor }));
}

/**
 * Trends by month, quarter or year (weeks are too short to read a trend
 * in, so they become months): each period against the one before and a
 * year earlier, and the categories moving most.
 */
export function trendsReport(userId: string, workspaceId: string, query: ReportQuery) {
  return withDb(async () => {
    const wanted = query.granularity ?? suggestedGranularity(query.from, query.to);
    const { workspace, granularity, list, fiscalStart } = await reportScope(userId, workspaceId, { ...query, granularity: wanted === "week" ? "month" : wanted });
    const ago = yearEarlier(query.from, query.to);
    const [now, before, lines, categories] = await Promise.all([
      dayTotals(workspace._id, query.from, query.to),
      dayTotals(workspace._id, ago.from, ago.to),
      spendLines(workspace._id, query.from, query.to),
      Category.find({ workspaceId: workspace._id }).select("name color parentId").lean(),
    ]);
    const agoPeriods = periods(ago.from, ago.to, granularity, fiscalStart);
    const result = trends({
      rows: incomeVsExpense(now, list).rows,
      // Compared period for period only when the year before cuts the same way.
      yearAgo: agoPeriods.length === list.length ? incomeVsExpense(before, agoPeriods).rows : null,
      lines,
      categories: categories.map((c) => ({ id: String(c._id), name: c.name, color: c.color, parentId: c.parentId ? String(c.parentId) : null })),
      periods: list,
      today: isoDate(new Date()),
    });
    return { baseCurrency: workspace.baseCurrency, granularity, ...result };
  });
}

/**
 * Net worth at the start and each period's end, and debt: each card and
 * loan's start, end, payments and new charges, and when the saved debt
 * plan clears it all. Balances use the rate in force on their day; an
 * account counts from when it opened and its currency has a rate.
 */
export function netWorthDebtReport(userId: string, workspaceId: string, query: ReportQuery) {
  return withDb(async () => {
    const { workspace, granularity, list } = await reportScope(userId, workspaceId, query);
    const accounts = await Account.find({ workspaceId: workspace._id }).select("name kind currency openingBalanceMinor openingDate").sort({ createdAt: 1 }).lean();
    if (!accounts.length) return { baseCurrency: workspace.baseCurrency, granularity, hasAccounts: false as const };

    const toBase = await baseConverter(workspace._id, workspace.baseCurrency);
    const entries = await entriesByAccount(accounts.map((a) => a._id));
    const days = [addDays(query.from, -1), ...list.map((p) => p.to)];
    const balances: AccountBalances[] = accounts.map((a) => {
      const own = balancesOn({ kind: a.kind as AccountKind, openingMinor: a.openingBalanceMinor, openingDate: isoDate(a.openingDate) }, entries.get(String(a._id)) ?? [], days);
      return { id: String(a._id), name: a.name, kind: a.kind as AccountKind, balances: own.map((b, i) => (b == null ? null : toBase(b, a.currency, days[i]!))) };
    });

    // Money through each card and loan within the range: in pays it down, out adds to it.
    const flows: DebtFlow[] = accounts
      .filter((a) => isLiability(a.kind as AccountKind))
      .map((a) => {
        let paidMinor = 0;
        let chargedMinor = 0;
        for (const e of entries.get(String(a._id)) ?? []) {
          if (e.date < query.from || e.date > query.to) continue;
          const base = toBase(e.amountMinor, a.currency, e.date) ?? 0;
          if (e.type === "income" || e.type === "refund" || e.type === "transfer_in") paidMinor += base;
          else if (e.type === "expense" || e.type === "transfer_out") chargedMinor += base;
        }
        return { accountId: String(a._id), paidMinor, chargedMinor };
      });

    // When the debt plan, as saved, clears what's owed today.
    const plan = await listDebts(userId, workspaceId);
    const counted = plan.debts.filter((d) => !d.needsTerms);
    const result = counted.length ? simulateDebts(counted, plan.strategy, plan.extraMonthlyMinor) : null;

    return {
      baseCurrency: workspace.baseCurrency,
      granularity,
      hasAccounts: true as const,
      netWorth: netWorthReport(balances, list),
      debt: debtProgress(balances, flows, list),
      plan: result
        ? { strategy: plan.strategy, months: result.months, debtFreeMonth: debtFreeMonth(isoDate(new Date()), result.months), totalInterestMinor: result.totalInterestMinor, leftOut: plan.debts.length - counted.length }
        : null,
    };
  });
}

/**
 * Rule-based insights: expenses well above their usual, categories moving
 * against the three stretches of the same length before, and savings.
 */
export function insightsReport(userId: string, workspaceId: string, query: ReportQuery) {
  return withDb(async () => {
    const { workspace } = await reportScope(userId, workspaceId, query);
    const ws = workspace._id;
    const stretches = earlierStretches(query.from, query.to, 3);
    const categories = await Category.find({ workspaceId: ws }).select("name parentId").lean();
    const info = new Map(categories.map((c) => [String(c._id), c]));
    // Spending rolls up into top-level categories.
    const topOf = (id: string | null) => {
      const c = id ? info.get(id) : undefined;
      if (!c) return null;
      return c.parentId && info.has(String(c.parentId)) ? String(c.parentId) : String(c._id);
    };
    const names = new Map(categories.filter((c) => !c.parentId).map((c) => [String(c._id), c.name]));
    const byCategory = (lines: SpendLine[]) => {
      const out = new Map<string, number>();
      for (const l of lines) {
        const key = topOf(l.categoryId) ?? UNCATEGORIZED;
        out.set(key, (out.get(key) ?? 0) + l.amountMinor);
      }
      return out;
    };
    const totals = (days: DayTotal[]) => ({
      incomeMinor: days.filter((d) => d.type === "income").reduce((s, d) => s + d.amountMinor, 0),
      expenseMinor: days.reduce((s, d) => s + (d.type === "expense" ? d.amountMinor : d.type === "refund" ? -d.amountMinor : 0), 0),
    });

    const [nowLines, nowDays, ...earlier] = await Promise.all([
      spendLines(ws, query.from, query.to),
      dayTotals(ws, query.from, query.to),
      ...stretches.flatMap((s) => [spendLines(ws, s.from, s.to), dayTotals(ws, s.from, s.to)]),
    ]);
    const earlierLines = stretches.map((_, i) => earlier[i * 2] as SpendLine[]);
    const earlierDays = stretches.map((_, i) => earlier[i * 2 + 1] as DayTotal[]);

    // Single expenses: this range's, and up to half a year before it to judge them by.
    const expenses = async (from: string, to: string, limit: number): Promise<SpendTxn[]> => {
      const docs = await Transaction.find({
        workspaceId: ws,
        deletedAt: null,
        isPosted: true,
        type: "expense",
        date: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) },
      })
        .sort({ date: -1 })
        .limit(limit)
        .select("date baseAmountMinor categoryId splits merchantKey merchant note")
        .lean();
      return docs.map((d) => {
        const categoryId = d.categoryId ? String(d.categoryId) : d.splits?.[0]?.categoryId ? String(d.splits[0].categoryId) : null;
        const key = topOf(categoryId);
        return {
          id: String(d._id),
          date: isoDate(d.date),
          amountMinor: d.baseAmountMinor,
          categoryKey: key,
          categoryName: key ? names.get(key) ?? null : null,
          merchantKey: d.merchantKey ?? null,
          merchantName: d.merchant ?? null,
          note: d.note ?? null,
        };
      });
    };
    const [current, history] = await Promise.all([
      expenses(query.from, query.to, 2_000),
      expenses(addDays(query.from, -182), addDays(query.from, -1), 5_000),
    ]);

    const money = (minor: number) => formatMoney(minor, workspace.baseCurrency);
    const variances = categoryVariance(byCategory(nowLines), earlierLines.map(byCategory), names);
    const days = Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86_400_000) + 1;
    return {
      baseCurrency: workspace.baseCurrency,
      compared: stretches,
      unusual: unusualSpending(current, history, money),
      variances,
      savings: savingsAnalysis(totals(nowDays), earlierDays.map(totals), variances, days),
    };
  });
}

/**
 * Money on hand (cash, bank and wallet accounts) period by period: the
 * balance at each end, and what came in and went out. Without such
 * accounts there's nothing to measure; the report says so.
 */
export function cashFlowReportFor(userId: string, workspaceId: string, query: ReportQuery) {
  return withDb(async () => {
    const { workspace, granularity, list } = await reportScope(userId, workspaceId, query);
    const accounts = await Account.find({ workspaceId: workspace._id }).select("kind currency openingBalanceMinor openingDate").lean();
    const cash = accounts.filter((a) => isCash(a.kind as AccountKind));
    if (!cash.length) {
      return { baseCurrency: workspace.baseCurrency, granularity, hasCashAccounts: false, rows: [], totals: { openingMinor: 0, inMinor: 0, outMinor: 0, otherMinor: 0, closingMinor: 0 } };
    }

    const toBase = await baseConverter(workspace._id, workspace.baseCurrency);
    const entries = await entriesByAccount(cash.map((a) => a._id));
    // Money on hand at the end of a day: each cash account's balance at that day's rate (none before it opened).
    const balanceAt = (day: string) =>
      cash.reduce((sum, a) => {
        const [balance] = balancesOn({ kind: a.kind as AccountKind, openingMinor: a.openingBalanceMinor, openingDate: a.openingDate.toISOString().slice(0, 10) }, entries.get(String(a._id)) ?? [], [day]);
        return sum + (balance == null ? 0 : toBase(balance, a.currency, day) ?? 0);
      }, 0);

    const kindOf = new Map(accounts.map((a) => [String(a._id), a.kind as AccountKind]));
    const ids = accounts.map((a) => a._id);
    const txns = await Transaction.find({
      workspaceId: workspace._id,
      deletedAt: null,
      isPosted: true,
      date: { $gte: new Date(`${query.from}T00:00:00.000Z`), $lte: new Date(`${query.to}T23:59:59.999Z`) },
      $or: [{ accountId: { $in: ids } }, { toAccountId: { $in: ids } }],
    })
      .select("type date baseAmountMinor accountId toAccountId")
      .lean();
    const moves: CashMove[] = txns.flatMap((t) => {
      const from = t.accountId ? kindOf.get(String(t.accountId)) ?? null : null;
      const to = t.toAccountId ? kindOf.get(String(t.toAccountId)) ?? null : null;
      // In the base currency: a transfer arrives as what was sent.
      const deltaMinor = cashEffect({ type: t.type, amountMinor: t.baseAmountMinor, toAmountMinor: null }, from, to);
      return deltaMinor ? [{ date: t.date.toISOString().slice(0, 10), deltaMinor }] : [];
    });

    return { baseCurrency: workspace.baseCurrency, granularity, hasCashAccounts: true, ...cashFlowReport(moves, list, balanceAt) };
  });
}
