import { periodIndex, type Period } from "@/src/core/reports/periods";

/**
 * Where the money went, by category and by merchant, over a range: each
 * one's spending (net of refunds, in the base currency), its share of the
 * total, how many expenses and their average, and the change from the
 * period just before of the same length. Categories roll up into their
 * top-level category, with the subcategories underneath; a split
 * transaction counts each line in its own category. Merchants past the
 * top ones are summed as "Others".
 */

/** Spending summed per day, category and merchant (refunds negative). */
export type SpendLine = {
  date: string;
  categoryId: string | null;
  merchantKey: string | null;
  merchantName: string | null;
  amountMinor: number;
  /** Expenses in it (refunds don't count). */
  count: number;
};

export type CategoryInfo = { id: string; name: string; color: string; parentId: string | null };

export type BreakdownRow = {
  key: string;
  name: string;
  amountMinor: number;
  sharePct: number;
  count: number;
  averageMinor: number | null;
  previousMinor: number;
  /** Change from the period before, as a whole percent; null with nothing then. */
  changePct: number | null;
};

export type CategoryRow = BreakdownRow & { color: string; children: BreakdownRow[] };

export type SpendingAnalysis = {
  totalMinor: number;
  previousTotalMinor: number;
  changePct: number | null;
  count: number;
  categories: CategoryRow[];
  merchants: BreakdownRow[];
  /** The top categories' spending in each period, for a stacked chart. */
  series: { periods: string[]; categories: Array<{ key: string; name: string; color: string; values: number[] }> };
};

export const UNCATEGORIZED = "uncategorized";
export const NO_MERCHANT = "none";
export const OTHERS = "others";

export function changePct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

type Sum = { amountMinor: number; count: number; name: string };

function sumBy(lines: readonly SpendLine[], keyOf: (l: SpendLine) => string, nameOf: (l: SpendLine) => string) {
  const out = new Map<string, Sum>();
  for (const l of lines) {
    const key = keyOf(l);
    const row = out.get(key) ?? { amountMinor: 0, count: 0, name: nameOf(l) };
    row.amountMinor += l.amountMinor;
    row.count += l.count;
    out.set(key, row);
  }
  return out;
}

function row(key: string, name: string, now: Sum | undefined, before: Sum | undefined, total: number): BreakdownRow {
  const amountMinor = now?.amountMinor ?? 0;
  const count = now?.count ?? 0;
  const previousMinor = before?.amountMinor ?? 0;
  return {
    key,
    name,
    amountMinor,
    sharePct: total > 0 ? Math.round((amountMinor / total) * 1000) / 10 : 0,
    count,
    averageMinor: count > 0 ? Math.round(amountMinor / count) : null,
    previousMinor,
    changePct: changePct(amountMinor, previousMinor),
  };
}

const byAmount = (a: BreakdownRow, b: BreakdownRow) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name);

export function analyseSpending(input: {
  current: readonly SpendLine[];
  previous: readonly SpendLine[];
  categories: readonly CategoryInfo[];
  periods: readonly Period[];
  topMerchants?: number;
  topSeries?: number;
}): SpendingAnalysis {
  const info = new Map(input.categories.map((c) => [c.id, c]));
  const topOf = (id: string | null) => {
    const c = id ? info.get(id) : undefined;
    return c ? (c.parentId && info.has(c.parentId) ? c.parentId : c.id) : UNCATEGORIZED;
  };
  const catName = (id: string) => (id === UNCATEGORIZED ? "Uncategorized" : info.get(id)?.name ?? "Deleted category");
  const total = input.current.reduce((s, l) => s + l.amountMinor, 0);
  const previousTotal = input.previous.reduce((s, l) => s + l.amountMinor, 0);

  // Categories: top-level, with what's in each subcategory (or the parent itself) underneath.
  const topNow = sumBy(input.current, (l) => topOf(l.categoryId), (l) => catName(topOf(l.categoryId)));
  const topBefore = sumBy(input.previous, (l) => topOf(l.categoryId), (l) => catName(topOf(l.categoryId)));
  const leafKey = (l: SpendLine) => (l.categoryId && info.has(l.categoryId) ? l.categoryId : UNCATEGORIZED);
  const leafNow = sumBy(input.current, leafKey, (l) => catName(leafKey(l)));
  const leafBefore = sumBy(input.previous, leafKey, (l) => catName(leafKey(l)));
  const categories: CategoryRow[] = [...topNow.keys()]
    .map((key) => {
      const leaves = [...leafNow.keys()].filter((leaf) => topOf(leaf === UNCATEGORIZED ? null : leaf) === key && leaf !== key);
      // Spending on the parent itself shows as its own line when it has subcategories in use.
      const own = leafNow.get(key);
      const children = leaves.length
        ? [...leaves.map((leaf) => row(leaf, catName(leaf), leafNow.get(leaf), leafBefore.get(leaf), total)), ...(own ? [row(key, `${catName(key)} (general)`, own, leafBefore.get(key), total)] : [])].sort(byAmount)
        : [];
      return { ...row(key, catName(key), topNow.get(key), topBefore.get(key), total), color: info.get(key)?.color ?? "#8A8F98", children };
    })
    .filter((r) => r.amountMinor !== 0 || r.count > 0)
    .sort(byAmount);

  // Merchants: the top ones, then everyone else as one line.
  const mKey = (l: SpendLine) => l.merchantKey ?? NO_MERCHANT;
  const mNow = sumBy(input.current, mKey, (l) => l.merchantName ?? "No merchant");
  const mBefore = sumBy(input.previous, mKey, (l) => l.merchantName ?? "No merchant");
  const allMerchants = [...mNow.entries()].map(([key, s]) => row(key, s.name, s, mBefore.get(key), total)).sort(byAmount);
  const named = allMerchants.filter((m) => m.key !== NO_MERCHANT);
  const limit = input.topMerchants ?? 15;
  const rest = [...named.slice(limit), ...allMerchants.filter((m) => m.key === NO_MERCHANT)];
  const merchants = named.slice(0, limit);
  if (rest.length) {
    const others = rest.reduce<Sum>((s, m) => ({ amountMinor: s.amountMinor + m.amountMinor, count: s.count + m.count, name: "" }), { amountMinor: 0, count: 0, name: "" });
    const othersBefore = rest.reduce((s, m) => s + m.previousMinor, 0);
    merchants.push(row(OTHERS, named.length > limit ? "All others" : "No merchant", others, { amountMinor: othersBefore, count: 0, name: "" }, total));
  }

  // The top categories over time.
  const topKeys = categories.slice(0, input.topSeries ?? 5).map((c) => c.key);
  const values = new Map(topKeys.map((k) => [k, input.periods.map(() => 0)]));
  for (const l of input.current) {
    const series = values.get(topOf(l.categoryId));
    const i = periodIndex(input.periods, l.date);
    if (series && i >= 0) series[i]! += l.amountMinor;
  }

  return {
    totalMinor: total,
    previousTotalMinor: previousTotal,
    changePct: changePct(total, previousTotal),
    count: input.current.reduce((s, l) => s + l.count, 0),
    categories,
    merchants,
    series: {
      periods: input.periods.map((p) => p.label),
      categories: topKeys.map((key) => ({ key, name: catName(key), color: info.get(key)?.color ?? "#8A8F98", values: values.get(key)! })),
    },
  };
}

/** The range just before [from, to], of the same number of days. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const day = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - start) / day) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(start - days * day), to: iso(start - day) };
}
