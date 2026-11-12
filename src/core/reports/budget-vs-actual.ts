import type { BudgetPeriod } from "@/src/core/models/enums";
import { isoDate, periodWindow } from "@/src/core/budgets/period";

/**
 * Budgets against what was actually spent, over a range. Each budget is
 * compared in its own periods (weekly, monthly, yearly, or its custom
 * dates), every one that overlaps the range, in full: a month half inside
 * the range is still that month's limit against that month's spending.
 * The period running today is "so far", with where spending would be at
 * an even pace. Each period uses the limit it had then. Amounts are in
 * the base currency; spending is net of refunds. Carry-over from rollover
 * isn't added: this is the plan as set against what happened.
 */

export type BudgetWindow = { from: string; to: string };

/** The budget's periods overlapping [from, to], oldest first (at most `max`, the latest). */
export function budgetWindows(
  period: BudgetPeriod,
  from: string,
  to: string,
  custom: { start: string | null; end: string | null },
  fiscalYearStartMonth = 1,
  max = 120,
): BudgetWindow[] {
  if (period === "custom") {
    if (!custom.start || !custom.end) return [];
    return custom.start <= to && custom.end >= from ? [{ from: custom.start, to: custom.end }] : [];
  }
  const out: BudgetWindow[] = [];
  let at = new Date(`${from}T12:00:00.000Z`);
  while (true) {
    const w = periodWindow(period, at, undefined, fiscalYearStartMonth);
    const win = { from: isoDate(w.from), to: isoDate(w.to) };
    if (win.from > to) break;
    out.push(win);
    at = new Date(w.to.getTime() + 13 * 3_600_000);
  }
  return out.slice(-max);
}

export type BudgetPeriodResult = BudgetWindow & {
  limitMinor: number;
  spentMinor: number;
  /** Limit less spending: positive is under budget. */
  varianceMinor: number;
  usedPct: number | null;
  status: "under" | "near" | "over";
  /** Today falls in it: spending so far, and where it'd be at an even pace. */
  inProgress: boolean;
  paceMinor: number | null;
};

export type BudgetComparison = {
  budgetId: string;
  categoryId: string;
  name: string;
  period: BudgetPeriod;
  periods: BudgetPeriodResult[];
  totals: { limitMinor: number; spentMinor: number; varianceMinor: number; usedPct: number | null; overCount: number };
};

const DAY = 86_400_000;

function daysIn(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
}

/** One budget's periods against what was spent in each (`spentByDay`: day → spending). */
export function compareBudget(
  budget: { budgetId: string; categoryId: string; name: string; period: BudgetPeriod; alertPct: number },
  windows: ReadonlyArray<BudgetWindow & { limitMinor: number }>,
  spentByDay: ReadonlyMap<string, number>,
  today: string,
): BudgetComparison {
  const periods = windows.map((w) => {
    let spentMinor = 0;
    for (const [day, amount] of spentByDay) if (day >= w.from && day <= w.to) spentMinor += amount;
    const usedPct = w.limitMinor > 0 ? Math.round((spentMinor / w.limitMinor) * 100) : null;
    const inProgress = w.from <= today && today <= w.to;
    const status: BudgetPeriodResult["status"] =
      spentMinor > w.limitMinor ? "over" : w.limitMinor > 0 && spentMinor >= Math.round((w.limitMinor * budget.alertPct) / 100) ? "near" : "under";
    return {
      ...w,
      spentMinor,
      varianceMinor: w.limitMinor - spentMinor,
      usedPct,
      status,
      inProgress,
      paceMinor: inProgress ? Math.round((w.limitMinor * daysIn(w.from, today)) / daysIn(w.from, w.to)) : null,
    };
  });
  const limitMinor = periods.reduce((s, p) => s + p.limitMinor, 0);
  const spentMinor = periods.reduce((s, p) => s + p.spentMinor, 0);
  return {
    ...budget,
    periods,
    totals: {
      limitMinor,
      spentMinor,
      varianceMinor: limitMinor - spentMinor,
      usedPct: limitMinor > 0 ? Math.round((spentMinor / limitMinor) * 100) : null,
      overCount: periods.filter((p) => p.status === "over").length,
    },
  };
}

/** Every budget's totals together, and spending no budget covers. */
export function budgetSummary(comparisons: readonly BudgetComparison[], totalSpentMinor: number, coveredSpentMinor: number) {
  const limitMinor = comparisons.reduce((s, c) => s + c.totals.limitMinor, 0);
  const spentMinor = comparisons.reduce((s, c) => s + c.totals.spentMinor, 0);
  return {
    limitMinor,
    spentMinor,
    varianceMinor: limitMinor - spentMinor,
    overBudgets: comparisons.filter((c) => c.totals.overCount > 0).length,
    /** In the range, in categories without a budget. */
    unbudgetedMinor: totalSpentMinor - coveredSpentMinor,
  };
}
