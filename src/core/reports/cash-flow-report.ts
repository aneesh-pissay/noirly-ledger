import { addDays, periodIndex, type Period } from "@/src/core/reports/periods";

/**
 * Two reports over a range, period by period, in the base currency.
 *
 * Income versus expense: income, spending net of refunds, what's left (net)
 * and the share of income kept (the savings rate).
 *
 * Cash flow: money on hand (cash, bank and wallet accounts) at the start
 * and end of each period, what came in and what went out. Moving money
 * between two of them is neither; paying a card is money out. "Other" is
 * whatever else changed the balance: a new account's opening balance, or
 * exchange rates moving. Opening + in − out + other = closing, always.
 */

/** Posted spending and income summed per day and type. */
export type DayTotal = { date: string; type: "income" | "expense" | "refund"; amountMinor: number };

export type IncomeExpenseRow = Period & { incomeMinor: number; expenseMinor: number; netMinor: number; savingsRatePct: number | null };

export type IncomeExpenseReport = {
  rows: IncomeExpenseRow[];
  totals: { incomeMinor: number; expenseMinor: number; netMinor: number; savingsRatePct: number | null };
  /** Average per period over those with any money moving. */
  averages: { incomeMinor: number; expenseMinor: number; netMinor: number };
};

/** Kept as a share of income, to a whole percent; null without income. */
export function savingsRate(incomeMinor: number, netMinor: number): number | null {
  return incomeMinor > 0 ? Math.round((netMinor / incomeMinor) * 100) : null;
}

export function incomeVsExpense(days: readonly DayTotal[], list: readonly Period[]): IncomeExpenseReport {
  const rows: IncomeExpenseRow[] = list.map((p) => ({ ...p, incomeMinor: 0, expenseMinor: 0, netMinor: 0, savingsRatePct: null }));
  for (const d of days) {
    const row = rows[periodIndex(list, d.date)];
    if (!row) continue;
    if (d.type === "income") row.incomeMinor += d.amountMinor;
    else if (d.type === "expense") row.expenseMinor += d.amountMinor;
    else row.expenseMinor -= d.amountMinor;
  }
  for (const r of rows) {
    r.netMinor = r.incomeMinor - r.expenseMinor;
    r.savingsRatePct = savingsRate(r.incomeMinor, r.netMinor);
  }
  const incomeMinor = rows.reduce((s, r) => s + r.incomeMinor, 0);
  const expenseMinor = rows.reduce((s, r) => s + r.expenseMinor, 0);
  const active = rows.filter((r) => r.incomeMinor || r.expenseMinor);
  const avg = (pick: (r: IncomeExpenseRow) => number) => (active.length ? Math.round(active.reduce((s, r) => s + pick(r), 0) / active.length) : 0);
  return {
    rows,
    totals: { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor, savingsRatePct: savingsRate(incomeMinor, incomeMinor - expenseMinor) },
    averages: { incomeMinor: avg((r) => r.incomeMinor), expenseMinor: avg((r) => r.expenseMinor), netMinor: avg((r) => r.netMinor) },
  };
}

/** Money on hand moving on a day: positive in, negative out (base currency). */
export type CashMove = { date: string; deltaMinor: number };

export type CashFlowRow = Period & { openingMinor: number; inMinor: number; outMinor: number; otherMinor: number; closingMinor: number };

export type CashFlowReport = {
  rows: CashFlowRow[];
  totals: { openingMinor: number; inMinor: number; outMinor: number; otherMinor: number; closingMinor: number };
};

/**
 * Cash flow from moves and the money on hand at the end of any day
 * (`balanceAt`). Periods are contiguous: one's closing is the next's opening.
 */
export function cashFlowReport(moves: readonly CashMove[], list: readonly Period[], balanceAt: (day: string) => number): CashFlowReport {
  const rows: CashFlowRow[] = list.map((p) => ({ ...p, openingMinor: balanceAt(addDays(p.from, -1)), inMinor: 0, outMinor: 0, otherMinor: 0, closingMinor: balanceAt(p.to) }));
  for (const m of moves) {
    const row = rows[periodIndex(list, m.date)];
    if (!row) continue;
    if (m.deltaMinor > 0) row.inMinor += m.deltaMinor;
    else row.outMinor -= m.deltaMinor;
  }
  for (const r of rows) r.otherMinor = r.closingMinor - r.openingMinor - r.inMinor + r.outMinor;
  const first = rows[0];
  const last = rows.at(-1);
  return {
    rows,
    totals: {
      openingMinor: first?.openingMinor ?? 0,
      inMinor: rows.reduce((s, r) => s + r.inMinor, 0),
      outMinor: rows.reduce((s, r) => s + r.outMinor, 0),
      otherMinor: rows.reduce((s, r) => s + r.otherMinor, 0),
      closingMinor: last?.closingMinor ?? 0,
    },
  };
}

/** A report's rows as CSV, amounts in major units with the currency. */
export function reportCsv(columns: ReadonlyArray<{ key: string; label: string; money?: boolean }>, rows: ReadonlyArray<Record<string, unknown>>, currency: string): string {
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const money = (minor: number) => `${minor < 0 ? "-" : ""}${Math.floor(Math.abs(minor) / 100)}.${String(Math.abs(minor) % 100).padStart(2, "0")}`;
  const header = [...columns.map((c) => cell(c.label)), "currency"].join(",");
  const body = rows.map((r) => [...columns.map((c) => cell(c.money && typeof r[c.key] === "number" ? money(r[c.key] as number) : r[c.key])), currency].join(","));
  return [header, ...body].join("\n") + "\n";
}
