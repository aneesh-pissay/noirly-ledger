import type { TransactionType } from "@/src/core/models/enums";
import { formatMinorToMajor } from "@/src/core/money";

/**
 * One transaction across several categories: each line has its category and
 * its share of the amount, and the lines add up to the whole. A split
 * transaction has no category of its own.
 */
export type SplitLine = { categoryId: string | null; amountMinor: number; note?: string | null };

export const MAX_SPLIT_LINES = 20;

/** Only spending and income have categories to split across. */
export function canSplit(type: TransactionType) {
  return type === "expense" || type === "income";
}

export function checkSplits(type: TransactionType, amountMinor: number, lines: SplitLine[]): { ok: true } | { ok: false; error: string } {
  if (!canSplit(type)) return { ok: false, error: "Only expenses and income can be split" };
  if (lines.length < 2) return { ok: false, error: "A split needs at least two lines" };
  if (lines.length > MAX_SPLIT_LINES) return { ok: false, error: `A split can have up to ${MAX_SPLIT_LINES} lines` };
  if (lines.some((line) => !Number.isInteger(line.amountMinor) || line.amountMinor <= 0)) {
    return { ok: false, error: "Each line needs an amount above zero" };
  }
  const categories = lines.map((line) => line.categoryId ?? "");
  if (new Set(categories).size !== categories.length) return { ok: false, error: "Each line needs a different category" };
  const total = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  if (total !== amountMinor) {
    const gap = amountMinor - total;
    return { ok: false, error: `The lines add up to ${formatMinorToMajor(total)}, ${formatMinorToMajor(Math.abs(gap))} ${gap > 0 ? "short of" : "more than"} the amount` };
  }
  return { ok: true };
}

/**
 * Shares `total` out in proportion to `weights`, in whole minor units that add
 * up exactly: each share is rounded down, then the units left over go to the
 * largest remainders (earlier lines first on a tie). Used for each line's
 * base-currency amount, and to split a refund like the expense it reverses.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const exact = weights.map((w) => (magnitude * w) / sum);
  const shares = exact.map(Math.floor);
  let left = magnitude - shares.reduce((a, b) => a + b, 0);
  const order = exact.map((value, i) => ({ i, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    shares[i]! += 1;
    left -= 1;
  }
  return shares.map((share) => sign * share);
}
