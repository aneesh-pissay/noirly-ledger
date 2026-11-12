import type { AccountKind } from "@/src/core/accounts";
import { addDays } from "@/src/core/projection";

/**
 * Cash flow: the money on hand (cash, bank and wallets, in the base
 * currency) day by day over a window, as known income arrives and bills go
 * out. Spending on a card doesn't touch cash until the card is paid, so
 * card and loan charges count only when money moves to pay them.
 */

/** Accounts whose balance is money on hand. */
export function isCash(kind: AccountKind | null | undefined) {
  return kind === "cash" || kind === "bank" || kind === "wallet";
}

/** One thing that moves money on hand on a day: positive in, negative out. */
export type CashEvent = { date: string; deltaMinor: number; label: string; kind: "income" | "bill" | "other" };

export type CashFlow = {
  startMinor: number;
  /** The balance at the end of each day of the window, from today. */
  points: Array<{ date: string; balanceMinor: number }>;
  events: CashEvent[];
  lowestMinor: number;
  lowestDate: string;
  /** The first day it goes below zero, if it does. */
  firstShortDate: string | null;
  /** The next day income arrives, and what bills take before then. */
  nextIncomeDate: string | null;
  billsBeforeIncomeMinor: number;
  inMinor: number;
  outMinor: number;
};

/**
 * How a scheduled item moves money on hand: by what it does to cash
 * accounts. Income into cash comes in, spending from cash goes out, moving
 * money from cash to a card or loan (paying it) goes out, and back comes in.
 * An item with no account counts as cash.
 */
export function cashEffect(
  item: { type: string; amountMinor: number; toAmountMinor?: number | null },
  from: AccountKind | null | "none",
  to: AccountKind | null,
) {
  const fromCash = from === "none" || isCash(from as AccountKind | null);
  if (item.type === "transfer") {
    const toCash = isCash(to);
    if (fromCash && !toCash) return -item.amountMinor;
    if (!fromCash && toCash) return item.toAmountMinor ?? item.amountMinor;
    return 0;
  }
  if (!fromCash) return 0;
  if (item.type === "income" || item.type === "refund") return item.amountMinor;
  if (item.type === "expense") return -item.amountMinor;
  return 0;
}

/** Day-by-day money on hand from `today` through `through`. */
export function cashFlow(startMinor: number, events: CashEvent[], today: string, through: string): CashFlow {
  const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const points: CashFlow["points"] = [];
  let balance = startMinor;
  let lowestMinor = startMinor;
  let lowestDate = today;
  let firstShortDate: string | null = startMinor < 0 ? today : null;
  for (let date = today, i = 0; date <= through; date = addDays(date, 1)) {
    // Each day takes what falls on it; on the first, that includes anything overdue.
    while (i < sorted.length && sorted[i]!.date <= date) balance += sorted[i++]!.deltaMinor;
    points.push({ date, balanceMinor: balance });
    if (balance < lowestMinor) {
      lowestMinor = balance;
      lowestDate = date;
    }
    if (balance < 0 && !firstShortDate) firstShortDate = date;
  }
  const nextIncome = sorted.find((e) => e.kind === "income" && e.deltaMinor > 0);
  const nextIncomeDate = nextIncome ? (nextIncome.date < today ? today : nextIncome.date) : null;
  const billsBeforeIncomeMinor = sorted
    .filter((e) => e.kind === "bill" && e.deltaMinor < 0 && (!nextIncomeDate || e.date < nextIncomeDate))
    .reduce((sum, e) => sum - e.deltaMinor, 0);
  return {
    startMinor,
    points,
    events: sorted,
    lowestMinor,
    lowestDate,
    firstShortDate,
    nextIncomeDate,
    billsBeforeIncomeMinor,
    inMinor: sorted.filter((e) => e.deltaMinor > 0).reduce((sum, e) => sum + e.deltaMinor, 0),
    outMinor: sorted.filter((e) => e.deltaMinor < 0).reduce((sum, e) => sum - e.deltaMinor, 0),
  };
}
