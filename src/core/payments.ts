import { nextOccurrence } from "@/src/core/recurrence/next";

/**
 * Scheduled payments: bills paid by hand (electricity, rent, a card bill),
 * each with a due date. One is due until its date passes, then overdue,
 * until it's marked paid: by recording the payment, linking a transaction
 * already there, or just saying it's paid. A repeating one makes the next
 * when it's paid.
 */

export const PAYMENT_REPEATS = ["none", "monthly", "quarterly", "yearly"] as const;
export type PaymentRepeat = (typeof PAYMENT_REPEATS)[number];

export type PaymentStatus = "due" | "overdue" | "paid";

/** A payment as the app shows it. */
export type PaymentView = {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
  accountId: string | null;
  categoryId: string | null;
  note: string | null;
  /** Who it's paid to over UPI, if known; a rupee bill with one gets a payment link. */
  upiId: string | null;
  payeeName: string | null;
  repeat: PaymentRepeat;
  status: PaymentStatus;
  paidOn: string | null;
  paidAmountMinor: number | null;
  transactionId: string | null;
  recordedHere: boolean;
};

export function paymentStatus(dueDate: string, today: string, paid: boolean): PaymentStatus {
  if (paid) return "paid";
  return dueDate < today ? "overdue" : "due";
}

/** Whole days past the due date (0 if not past). */
export function daysOverdue(dueDate: string, today: string) {
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000));
}

/**
 * The next due date of a repeating payment. Monthly and quarterly ones keep
 * their day of the month: a bill due on the 31st falls on the 30th in a
 * short month, and on the 31st again after.
 */
export function nextDueDate(dueDate: string, repeat: PaymentRepeat, dayOfMonth?: number | null): string | null {
  if (repeat === "none") return null;
  const from = new Date(`${dueDate}T12:00:00.000Z`);
  const day = dayOfMonth ?? from.getUTCDate();
  const next =
    repeat === "yearly"
      ? nextOccurrence(from, { frequency: "yearly", interval: 1 })
      : nextOccurrence(from, { frequency: "monthly", interval: repeat === "quarterly" ? 3 : 1, byMonthDay: day });
  return next.toISOString().slice(0, 10);
}
