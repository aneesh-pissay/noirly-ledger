/**
 * Forecasts and what-if scenarios, month by month from next month on.
 *
 * The baseline is what a typical month looks like: monthly income, and
 * monthly spending per top-level category (from recent months, or from
 * budgets). Cash starts at what's in cash, bank and wallet accounts today
 * less what's owed on cards. A scenario is a list of changes on top:
 * income or a category up or down (by an amount or a percent) from some
 * month on, a one-off amount in one month, or a new repeating amount for a
 * number of months. Amounts are base-currency minor units; a positive
 * one-off or repeating amount is money in, negative is money out.
 */

export type ForecastBaseline = {
  startCashMinor: number;
  monthlyIncomeMinor: number;
  /** Top-level category id (or "uncategorized") → monthly spending. */
  spendingByCategory: Record<string, number>;
};

export type ScenarioChange =
  | { kind: "income"; amountMinor?: number; pct?: number; fromMonth?: number; label?: string }
  | { kind: "category"; categoryId: string; amountMinor?: number; pct?: number; fromMonth?: number; label?: string }
  | { kind: "one_off"; amountMinor: number; month: number; label?: string }
  | { kind: "recurring"; amountMinor: number; fromMonth: number; months?: number | null; label?: string };

export const SCENARIO_CHANGE_KINDS = ["income", "category", "one_off", "recurring"] as const;

export type ForecastRow = {
  /** 1 is next month. */
  index: number;
  month: string;
  incomeMinor: number;
  spendingMinor: number;
  /** One-off and repeating amounts from the scenario (positive in, negative out). */
  otherMinor: number;
  netMinor: number;
  cashMinor: number;
};

/** YYYY-MM for `index` months after the month of `today`. */
export function monthAfter(today: string, index: number) {
  const [year, month] = today.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 + index, 1)).toISOString().slice(0, 7);
}

/** A monthly figure after a change from a month on: plus an amount, or scaled by a percent. */
function adjusted(value: number, change: { amountMinor?: number; pct?: number }) {
  if (change.pct != null) return Math.round(value * (1 + change.pct / 100));
  return value + (change.amountMinor ?? 0);
}

export function forecast(baseline: ForecastBaseline, changes: ScenarioChange[], months: number, today: string): ForecastRow[] {
  const rows: ForecastRow[] = [];
  let cash = baseline.startCashMinor;
  for (let index = 1; index <= months; index++) {
    let income = baseline.monthlyIncomeMinor;
    const spending = { ...baseline.spendingByCategory };
    let other = 0;
    for (const change of changes) {
      if (change.kind === "income" && index >= (change.fromMonth ?? 1)) income = adjusted(income, change);
      if (change.kind === "category" && index >= (change.fromMonth ?? 1)) {
        spending[change.categoryId] = Math.max(0, adjusted(spending[change.categoryId] ?? 0, change));
      }
      if (change.kind === "one_off" && change.month === index) other += change.amountMinor;
      if (change.kind === "recurring" && index >= change.fromMonth && (change.months == null || index < change.fromMonth + change.months)) {
        other += change.amountMinor;
      }
    }
    const spendingMinor = Object.values(spending).reduce((sum, value) => sum + value, 0);
    const netMinor = income - spendingMinor + other;
    cash += netMinor;
    rows.push({ index, month: monthAfter(today, index), incomeMinor: income, spendingMinor, otherMinor: other, netMinor, cashMinor: cash });
  }
  return rows;
}

/** Where a forecast ends, its lowest point, and the first month cash would go below zero. */
export function forecastSummary(rows: ForecastRow[], startCashMinor: number) {
  let lowest = { month: null as string | null, cashMinor: startCashMinor };
  let firstNegative: string | null = null;
  for (const row of rows) {
    if (row.cashMinor < lowest.cashMinor) lowest = { month: row.month, cashMinor: row.cashMinor };
    if (row.cashMinor < 0 && !firstNegative) firstNegative = row.month;
  }
  return { endCashMinor: rows.at(-1)?.cashMinor ?? startCashMinor, lowest, firstNegativeMonth: firstNegative };
}
