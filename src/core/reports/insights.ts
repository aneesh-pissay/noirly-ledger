/**
 * Rule-based insights over a range (AI comes later, in Phase 10). All
 * amounts are in the base currency.
 *
 * Unusual spending: an expense well above what's normal for its merchant
 * (or, with too little history there, its category): more than three
 * times the usual amount and beyond the usual spread. "Usual" is the
 * median, so one big purchase in the past doesn't hide the next.
 *
 * Variance: each category against its average over the same number of
 * days in the stretches just before; flagged when the change is big both
 * in percent and in money, and a spike when it's far outside what those
 * stretches ranged over.
 *
 * Savings: what share of income was kept, against before; where it'd be
 * over a year at this pace; and what bringing the categories that rose
 * back to their usual level would save.
 */

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Median absolute deviation: how far amounts usually sit from the median. */
export function mad(values: readonly number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export type SpendTxn = {
  id: string;
  date: string;
  amountMinor: number;
  categoryKey: string | null;
  categoryName: string | null;
  merchantKey: string | null;
  merchantName: string | null;
  note: string | null;
};

export type Unusual = SpendTxn & { usualMinor: number; timesUsual: number; basis: "merchant" | "category"; reason: string };

const MIN_MERCHANT_HISTORY = 3;
const MIN_CATEGORY_HISTORY = 5;

/**
 * Expenses well above normal for where they were spent. `history` is
 * earlier expenses (amounts only matter); `floorMinor` keeps tiny ones out.
 */
export function unusualSpending(current: readonly SpendTxn[], history: readonly SpendTxn[], money: (minor: number) => string, floorMinor = 1_000, limit = 10): Unusual[] {
  const byMerchant = new Map<string, number[]>();
  const byCategory = new Map<string, number[]>();
  for (const h of history) {
    if (h.merchantKey) byMerchant.set(h.merchantKey, [...(byMerchant.get(h.merchantKey) ?? []), h.amountMinor]);
    if (h.categoryKey) byCategory.set(h.categoryKey, [...(byCategory.get(h.categoryKey) ?? []), h.amountMinor]);
  }
  const out: Unusual[] = [];
  for (const t of current) {
    if (t.amountMinor < floorMinor) continue;
    const merchant = t.merchantKey ? byMerchant.get(t.merchantKey) ?? [] : [];
    const category = t.categoryKey ? byCategory.get(t.categoryKey) ?? [] : [];
    const basis = merchant.length >= MIN_MERCHANT_HISTORY ? "merchant" : category.length >= MIN_CATEGORY_HISTORY ? "category" : null;
    if (!basis) continue;
    const values = basis === "merchant" ? merchant : category;
    const usual = median(values);
    if (usual <= 0) continue;
    const line = Math.max(3 * usual, usual + 4 * mad(values));
    if (t.amountMinor <= line) continue;
    const times = Math.round((t.amountMinor / usual) * 10) / 10;
    const where = basis === "merchant" ? t.merchantName ?? "this merchant" : t.categoryName ?? "this category";
    out.push({ ...t, usualMinor: usual, timesUsual: times, basis, reason: `${times}× the usual ${money(usual)} at ${where}` });
  }
  return out.sort((a, b) => b.timesUsual - a.timesUsual || b.amountMinor - a.amountMinor).slice(0, limit);
}

export type CategoryVariance = {
  key: string;
  name: string;
  actualMinor: number;
  /** The average over the earlier stretches. */
  expectedMinor: number;
  varianceMinor: number;
  variancePct: number | null;
  /** Far outside what the earlier stretches ranged over. */
  spike: boolean;
  flagged: boolean;
};

/**
 * Each category in the range against its earlier stretches (`baseline[i]`
 * is one stretch's spending per category key). Flagged at 25% and a
 * floor in money either way; biggest moves first.
 */
export function categoryVariance(
  actual: ReadonlyMap<string, number>,
  baseline: ReadonlyArray<ReadonlyMap<string, number>>,
  names: ReadonlyMap<string, string>,
  floorMinor = 2_000,
  pct = 25,
): CategoryVariance[] {
  const keys = new Set([...actual.keys(), ...baseline.flatMap((b) => [...b.keys()])]);
  const n = baseline.length || 1;
  return [...keys]
    .map((key) => {
      const actualMinor = actual.get(key) ?? 0;
      const series = baseline.map((b) => b.get(key) ?? 0);
      const expectedMinor = Math.round(series.reduce((s, v) => s + v, 0) / n);
      const sd = Math.sqrt(series.reduce((s, v) => s + (v - expectedMinor) ** 2, 0) / n);
      const varianceMinor = actualMinor - expectedMinor;
      const variancePct = expectedMinor > 0 ? Math.round((varianceMinor / expectedMinor) * 100) : null;
      const big = Math.abs(varianceMinor) >= floorMinor && (variancePct === null ? actualMinor >= floorMinor : Math.abs(variancePct) >= pct);
      return {
        key,
        name: names.get(key) ?? "Uncategorized",
        actualMinor,
        expectedMinor,
        varianceMinor,
        variancePct,
        spike: baseline.length >= 2 && varianceMinor > 0 && actualMinor > expectedMinor + 2 * Math.max(sd, expectedMinor * 0.1) && Math.abs(varianceMinor) >= floorMinor,
        flagged: big,
      };
    })
    .filter((v) => v.actualMinor || v.expectedMinor)
    .sort((a, b) => Math.abs(b.varianceMinor) - Math.abs(a.varianceMinor) || a.name.localeCompare(b.name));
}

export type SavingsAnalysis = {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  savingsRatePct: number | null;
  /** Averages over the earlier stretches. */
  usualIncomeMinor: number;
  usualExpenseMinor: number;
  usualSavingsRatePct: number | null;
  /** Kept over a year at this range's pace. */
  yearlyAtThisPaceMinor: number;
  /** Bringing every category that rose back to its usual level, per stretch this long. */
  potentialMinor: number;
  potentialFrom: Array<{ key: string; name: string; overMinor: number }>;
};

export function savingsAnalysis(
  now: { incomeMinor: number; expenseMinor: number },
  before: ReadonlyArray<{ incomeMinor: number; expenseMinor: number }>,
  variances: readonly CategoryVariance[],
  days: number,
): SavingsAnalysis {
  const rate = (income: number, net: number) => (income > 0 ? Math.round((net / income) * 100) : null);
  const n = before.length || 1;
  const usualIncomeMinor = Math.round(before.reduce((s, b) => s + b.incomeMinor, 0) / n);
  const usualExpenseMinor = Math.round(before.reduce((s, b) => s + b.expenseMinor, 0) / n);
  const netMinor = now.incomeMinor - now.expenseMinor;
  const risers = variances.filter((v) => v.flagged && v.varianceMinor > 0);
  return {
    ...now,
    netMinor,
    savingsRatePct: rate(now.incomeMinor, netMinor),
    usualIncomeMinor,
    usualExpenseMinor,
    usualSavingsRatePct: before.length ? rate(usualIncomeMinor, usualIncomeMinor - usualExpenseMinor) : null,
    yearlyAtThisPaceMinor: days > 0 ? Math.round((netMinor * 365) / days) : 0,
    potentialMinor: risers.reduce((s, v) => s + v.varianceMinor, 0),
    potentialFrom: risers.map((v) => ({ key: v.key, name: v.name, overMinor: v.varianceMinor })),
  };
}

/** The `count` stretches of the same length just before [from, to], latest first. */
export function earlierStretches(from: string, to: string, count: number): Array<{ from: string; to: string }> {
  const day = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - start) / day) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return Array.from({ length: count }, (_, i) => ({ from: iso(start - (i + 1) * days * day), to: iso(start - i * days * day - day) }));
}
