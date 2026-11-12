import type { ReminderSettings } from "@/src/core/reminders";

/**
 * The bill and subscription calendar: a month of money going out on a
 * schedule (recurring expenses, EMI installments and expenses entered ahead
 * of their date), each paid, due or still to come.
 */

export type BillSource = "recurring" | "emi" | "scheduled" | "payment" | "card";

/**
 * Paid: recorded and its day has come. Due: its day has come but it isn't
 * recorded yet. Upcoming: still ahead. Overdue: a payment made by hand whose
 * due date has passed without it being marked paid.
 */
export type BillStatus = "paid" | "due" | "upcoming" | "overdue";

export type BillItem = {
  /** The transaction's id, or the rule's id and date for an occurrence not recorded yet. */
  id: string;
  date: string;
  merchant: string | null;
  note: string | null;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  accountId: string | null;
  source: BillSource;
  status: BillStatus;
  transactionId: string | null;
  /** The recurring rule it comes from, and how often it repeats. */
  ruleId: string | null;
  frequency: string | null;
  /** Recurring ones: the rule's reminder settings (null for the default notice). */
  reminders?: ReminderSettings | null;
};

/** A day in the month to act on rather than pay: a free trial ending, or a date to cancel by. */
export type BillMarker = { date: string; kind: "trial" | "cancel"; ruleId: string; name: string | null };

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(text: string) {
  return MONTH.test(text);
}

/** The month's first and last day, as YYYY-MM-DD. */
export function monthBounds(month: string) {
  const [, y, m] = MONTH.exec(month) ?? [];
  if (!y || !m) throw new Error(`Not a month: ${month}`);
  const last = new Date(Date.UTC(+y, +m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

/** The month before or after, by `delta` months. */
export function shiftMonth(month: string, delta: number) {
  const [, y, m] = MONTH.exec(month) ?? [];
  const date = new Date(Date.UTC(+y!, +m! - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** The month as weeks of seven days (Monday first, or Sunday), with null for days outside it. */
export function calendarWeeks(month: string, weekStartsOn: 0 | 1 = 1): Array<Array<string | null>> {
  const { first, last } = monthBounds(month);
  const days = Number(last.slice(8));
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7;
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export function billStatus(date: string, today: string, recorded: boolean): BillStatus {
  if (date > today) return "upcoming";
  return recorded ? "paid" : "due";
}

/** What the month's bills come to in each currency: paid so far, and still to pay (due or upcoming). */
export function billTotals(items: BillItem[]) {
  const totals = new Map<string, { paidMinor: number; toPayMinor: number }>();
  for (const item of items) {
    const row = totals.get(item.currency) ?? { paidMinor: 0, toPayMinor: 0 };
    if (item.status === "paid") row.paidMinor += item.amountMinor;
    else row.toPayMinor += item.amountMinor;
    totals.set(item.currency, row);
  }
  return [...totals].map(([currency, row]) => ({ currency, ...row })).sort((a, b) => b.paidMinor + b.toPayMinor - (a.paidMinor + a.toPayMinor));
}
