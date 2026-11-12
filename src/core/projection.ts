import { accountBalance, isLiability, type AccountKind } from "@/src/core/accounts";
import type { DatedEntry } from "@/src/core/net-worth";
import type { TransactionType } from "@/src/core/models/enums";

/** The day `days` after `today` (YYYY-MM-DD, UTC). */
export function addDays(today: string, days: number) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Where an account is heading: its balance after everything known to be
 * coming (future-dated entries and upcoming recurring ones), and the lowest
 * it gets on the way, so a dip below zero before payday shows up.
 */
export function projectAccount(kind: AccountKind, todayMinor: number, upcoming: DatedEntry[]) {
  const days = [...new Set(upcoming.map((entry) => entry.date))].sort();
  let balance = todayMinor;
  // For cards and loans the worst point is the most owed; for the rest, the least in it.
  const worse = (a: number, b: number) => (isLiability(kind) ? a > b : a < b);
  let lowestMinor = todayMinor;
  let lowestDate: string | null = null;
  for (const day of days) {
    balance = accountBalance(kind, balance, upcoming.filter((entry) => entry.date === day));
    if (worse(balance, lowestMinor)) {
      lowestMinor = balance;
      lowestDate = day;
    }
  }
  return { projectedMinor: balance, lowestMinor, lowestDate };
}

/** How an upcoming item with no account moves money: income and refunds in, spending out. */
export function unassignedEffect(type: TransactionType, amountMinor: number) {
  if (type === "income" || type === "refund") return amountMinor;
  if (type === "expense") return -amountMinor;
  return 0;
}

/**
 * What's free to spend by the end of the window, in the base currency: cash,
 * bank and wallet balances once known income and bills land, less what will
 * be owed on credit cards then. Loans are paid off over time, so they're left
 * out; their scheduled payments already come out of the paying account.
 * Upcoming items with no account count too.
 */
export function availableToSpend(accounts: Array<{ kind: AccountKind; projectedBaseMinor: number }>, unassignedBaseMinor: number) {
  let total = unassignedBaseMinor;
  for (const account of accounts) {
    if (account.kind === "loan") continue;
    total += account.kind === "credit_card" ? -account.projectedBaseMinor : account.projectedBaseMinor;
  }
  return total;
}
