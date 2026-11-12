import { periodIndex, type Period } from "@/src/core/reports/periods";
import { changePct, type CategoryInfo, type SpendLine } from "@/src/core/reports/spending";
import type { IncomeExpenseRow } from "@/src/core/reports/cash-flow-report";

/**
 * Trends month by month, quarter by quarter or year by year: each period
 * against the one before and the same one a year earlier, a moving
 * average to smooth spending out, and the categories moving most between
 * the last two finished periods. A period still running is shown but not
 * compared, so a half-month never reads as a fall.
 */

export type TrendRow = IncomeExpenseRow & {
  /** Today falls in it. */
  inProgress: boolean;
  spendingChangePct: number | null;
  incomeChangePct: number | null;
  /** Against the same period a year earlier. */
  spendingYearAgoMinor: number | null;
  spendingYearChangePct: number | null;
  /** Spending averaged over this period and the two before (null until there are three). */
  spendingAverageMinor: number | null;
};

export type CategoryMover = { key: string; name: string; color: string; fromMinor: number; toMinor: number; changeMinor: number; changePct: number | null };

export type Trends = {
  rows: TrendRow[];
  /** The last two finished periods compared, when there are two. */
  compared: { from: string; to: string } | null;
  risers: CategoryMover[];
  fallers: CategoryMover[];
  /** Top-level categories whose spending rose period after period up to the last finished one (at least three in a row). */
  rising: Array<{ key: string; name: string; streak: number }>;
};

export function trendRows(rows: readonly IncomeExpenseRow[], yearAgo: readonly IncomeExpenseRow[] | null, today: string, average = 3): TrendRow[] {
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    const inProgress = r.from <= today && today <= r.to;
    const ago = yearAgo?.[i] ?? null;
    const window = i + 1 >= average ? rows.slice(i + 1 - average, i + 1) : null;
    return {
      ...r,
      inProgress,
      spendingChangePct: prev && !inProgress ? changePct(r.expenseMinor, prev.expenseMinor) : null,
      incomeChangePct: prev && !inProgress ? changePct(r.incomeMinor, prev.incomeMinor) : null,
      spendingYearAgoMinor: ago ? ago.expenseMinor : null,
      spendingYearChangePct: ago && !inProgress ? changePct(r.expenseMinor, ago.expenseMinor) : null,
      spendingAverageMinor: window ? Math.round(window.reduce((s, w) => s + w.expenseMinor, 0) / average) : null,
    };
  });
}

/** Spending per top-level category in each period. */
export function categoryByPeriod(lines: readonly SpendLine[], categories: readonly CategoryInfo[], list: readonly Period[]) {
  const info = new Map(categories.map((c) => [c.id, c]));
  const topOf = (id: string | null) => {
    const c = id ? info.get(id) : undefined;
    return c ? (c.parentId && info.has(c.parentId) ? c.parentId : c.id) : null;
  };
  const out = new Map<string, number[]>();
  for (const l of lines) {
    const key = topOf(l.categoryId);
    const i = periodIndex(list, l.date);
    if (!key || i < 0) continue;
    const values = out.get(key) ?? list.map(() => 0);
    values[i]! += l.amountMinor;
    out.set(key, values);
  }
  return out;
}

export function trends(input: {
  rows: readonly IncomeExpenseRow[];
  yearAgo: readonly IncomeExpenseRow[] | null;
  lines: readonly SpendLine[];
  categories: readonly CategoryInfo[];
  periods: readonly Period[];
  today: string;
  movers?: number;
}): Trends {
  const rows = trendRows(input.rows, input.yearAgo, input.today);
  const finished = rows.map((r, i) => (r.inProgress || r.to > input.today ? -1 : i)).filter((i) => i >= 0);
  const byCat = categoryByPeriod(input.lines, input.categories, input.periods);
  const info = new Map(input.categories.map((c) => [c.id, c]));
  const nameOf = (key: string) => info.get(key)?.name ?? "Deleted category";
  const colorOf = (key: string) => info.get(key)?.color ?? "#8A8F98";

  let risers: CategoryMover[] = [];
  let fallers: CategoryMover[] = [];
  let compared: Trends["compared"] = null;
  const rising: Trends["rising"] = [];
  if (finished.length >= 2) {
    const [a, b] = [finished.at(-2)!, finished.at(-1)!];
    compared = { from: rows[a]!.label, to: rows[b]!.label };
    const moves = [...byCat.entries()].map(([key, values]) => ({
      key,
      name: nameOf(key),
      color: colorOf(key),
      fromMinor: values[a]!,
      toMinor: values[b]!,
      changeMinor: values[b]! - values[a]!,
      changePct: changePct(values[b]!, values[a]!),
    }));
    const limit = input.movers ?? 5;
    risers = moves.filter((m) => m.changeMinor > 0).sort((x, y) => y.changeMinor - x.changeMinor).slice(0, limit);
    fallers = moves.filter((m) => m.changeMinor < 0).sort((x, y) => x.changeMinor - y.changeMinor).slice(0, limit);
    for (const [key, values] of byCat) {
      let streak = 0;
      for (let k = finished.length - 1; k > 0; k--) {
        if (values[finished[k]!]! > values[finished[k - 1]!]!) streak += 1;
        else break;
      }
      if (streak >= 2) rising.push({ key, name: nameOf(key), streak: streak + 1 });
    }
    rising.sort((x, y) => y.streak - x.streak || x.name.localeCompare(y.name));
  }
  return { rows, compared, risers, fallers, rising };
}

/** The same range a year earlier. */
export function yearEarlier(from: string, to: string) {
  const back = (day: string) => {
    const [y, m, d] = day.split("-").map(Number) as [number, number, number];
    // 29 Feb falls back to 28 Feb.
    const date = new Date(Date.UTC(y - 1, m - 1, d));
    if (date.getUTCMonth() !== m - 1) date.setUTCDate(0);
    return date.toISOString().slice(0, 10);
  };
  return { from: back(from), to: back(to) };
}
