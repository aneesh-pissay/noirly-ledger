import { accountBalance, isLiability, type AccountKind, type BalanceEntry } from "@/src/core/accounts";

/** A day's money through an account, in its currency. Dates are YYYY-MM-DD. */
export type DatedEntry = BalanceEntry & { date: string };

/**
 * The days a net-worth history is measured on: the last day of each of the
 * `months` months before this one, then today.
 */
export function historyDays(today: string, months: number): string[] {
  const [year, month] = today.split("-").map(Number) as [number, number];
  const days: string[] = [];
  for (let back = months; back >= 1; back--) {
    // Day 0 of a month is the last day of the month before it.
    const end = new Date(Date.UTC(year, month - back, 0));
    days.push(end.toISOString().slice(0, 10));
  }
  days.push(today);
  return days;
}

/**
 * The account's balance at the end of each day, or null before it was opened.
 * Matches accountBalance on the last day once every entry is dated on or before it.
 */
export function balancesOn(
  account: { kind: AccountKind; openingMinor: number; openingDate: string },
  entries: DatedEntry[],
  days: string[],
): Array<number | null> {
  return days.map((day) =>
    day < account.openingDate
      ? null
      : accountBalance(account.kind, account.openingMinor, entries.filter((entry) => entry.date <= day)),
  );
}

/**
 * Net worth from balances already in the base currency: what you have minus
 * what you owe. An overdrawn bank account counts as a negative asset, and a
 * card in credit as a negative liability.
 */
export function netWorth(accounts: Array<{ kind: AccountKind; baseBalanceMinor: number }>) {
  let assetsMinor = 0;
  let liabilitiesMinor = 0;
  for (const account of accounts) {
    if (isLiability(account.kind)) liabilitiesMinor += account.baseBalanceMinor;
    else assetsMinor += account.baseBalanceMinor;
  }
  return { assetsMinor, liabilitiesMinor, netMinor: assetsMinor - liabilitiesMinor };
}
