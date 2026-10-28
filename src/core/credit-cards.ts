/**
 * Credit card statements: a card's bill is made up on its statement day each
 * month and is due some days later (about 20 in India). What's due is the
 * balance on the statement less what's been paid since; the minimum due is
 * a small share of it. Spending after the statement goes on the next one.
 */

export type CardTerms = {
  /** Day of the month the statement is made up (1–28, or 31 for the month's last day). */
  statementDay: number;
  /** Days from the statement to the payment due date. */
  dueDays: number;
  creditLimitMinor: number | null;
  /** Share of the statement that's the minimum due, in percent. */
  minimumPct: number;
};

/** A card as the app shows it: its terms (once set) and where its bill stands. */
export type CardView = {
  accountId: string;
  name: string;
  currency: string;
  terms: CardTerms | null;
  balanceNowMinor: number;
  bill: ReturnType<typeof cardBill> | null;
};

export const DEFAULT_DUE_DAYS = 20;
export const DEFAULT_MINIMUM_PCT = 5;

export type CardStatus = "nothing_due" | "due" | "paid" | "overdue";

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** The statement day in a given month, kept to the month's last day. */
function statementIn(year: number, month: number, day: number) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(day, last))));
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/**
 * The statement dates around today: the last one made up (on or before
 * today), the next one, and the last one's due date.
 */
export function cardCycle(today: string, statementDay: number) {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const thisMonth = statementIn(y, m - 1, statementDay);
  const lastStatement = thisMonth <= today ? thisMonth : statementIn(y, m - 2, statementDay);
  const [ly, lm] = lastStatement.split("-").map(Number) as [number, number];
  const nextStatement = statementIn(ly, lm, statementDay);
  return { lastStatement, nextStatement };
}

/**
 * Where a card's bill stands today, from the balance owed on its last
 * statement date and what's been paid into the card since.
 */
export function cardBill(
  terms: CardTerms,
  amounts: { statementBalanceMinor: number; paidSinceMinor: number; balanceNowMinor: number },
  today: string,
) {
  const { lastStatement, nextStatement } = cardCycle(today, terms.statementDay);
  const dueDate = addDays(lastStatement, terms.dueDays);
  const statementMinor = Math.max(0, amounts.statementBalanceMinor);
  const leftMinor = Math.max(0, statementMinor - amounts.paidSinceMinor);
  // Rounded up to a whole unit, as banks do; never more than what's left.
  const minimumMinor = Math.min(leftMinor, Math.ceil((statementMinor * terms.minimumPct) / 100 / 100) * 100);
  const minimumLeftMinor = Math.max(0, minimumMinor - amounts.paidSinceMinor);
  const status: CardStatus = statementMinor === 0 ? "nothing_due" : leftMinor === 0 ? "paid" : today > dueDate ? "overdue" : "due";
  const utilizationPct = terms.creditLimitMinor ? Math.round((Math.max(0, amounts.balanceNowMinor) / terms.creditLimitMinor) * 100) : null;
  return { lastStatement, nextStatement, dueDate, statementMinor, leftMinor, minimumMinor, minimumLeftMinor, status, utilizationPct };
}
