/**
 * Sinking funds: money put aside a little each month for a known expense
 * that comes in one lump (car insurance, a yearly renewal, school fees), so
 * it's there when it's due. A fund tied to a repeating bill starts over for
 * its next due date once the bill is paid.
 */

export const FUND_REPEATS = ["none", "quarterly", "yearly"] as const;
export type FundRepeat = (typeof FUND_REPEATS)[number];

export type FundStatus = "ready" | "on_track" | "behind" | "overdue";

export type SinkingFundView = {
  id: string;
  name: string;
  targetMinor: number;
  savedMinor: number;
  currency: string;
  dueDate: string;
  startDate: string;
  repeat: FundRepeat;
  /** The bill it saves for: a recurring rule or a bill to pay. */
  ruleId: string | null;
  paymentId: string | null;
  status: FundStatus;
  /** What to set aside each month from now to have it all by the due date. */
  monthlyMinor: number;
  monthsLeft: number;
  /** What should be saved by now, setting aside evenly since the start. */
  expectedMinor: number;
};

/** A bill worth saving up for: one that comes in a lump every quarter or year, or a one-off a while away. */
export type FundSuggestion = {
  source: "rule" | "payment";
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
  repeat: FundRepeat;
  monthlyMinor: number;
};

function days(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const MONTH_DAYS = 30.44;

/** Months of setting aside left before the due date, counting this one; at least one while it's ahead. */
export function monthsLeft(today: string, dueDate: string) {
  const left = days(today, dueDate);
  return left <= 0 ? 0 : Math.max(1, Math.ceil(left / MONTH_DAYS));
}

/** Where a fund stands today: how much a month it needs, and whether it's keeping up. */
export function fundProgress(fund: { targetMinor: number; savedMinor: number; dueDate: string; startDate: string }, today: string) {
  const remaining = Math.max(0, fund.targetMinor - fund.savedMinor);
  const months = monthsLeft(today, fund.dueDate);
  const total = Math.max(1, days(fund.startDate, fund.dueDate));
  const elapsed = Math.min(total, Math.max(0, days(fund.startDate, today)));
  const expectedMinor = Math.round((fund.targetMinor * elapsed) / total);
  const status: FundStatus = remaining === 0 ? "ready" : months === 0 ? "overdue" : fund.savedMinor >= expectedMinor ? "on_track" : "behind";
  return {
    status,
    monthsLeft: months,
    // Rounded up to a whole rupee (or dollar): easier to set aside, and it still gets there.
    monthlyMinor: months ? Math.ceil(remaining / months / 100) * 100 : remaining,
    expectedMinor,
  };
}

/** A fund's next due date once this one is paid: a quarter or a year on, or none for a one-off. */
export function nextFundDue(dueDate: string, repeat: FundRepeat) {
  if (repeat === "none") return null;
  const date = new Date(`${dueDate}T12:00:00Z`);
  const day = date.getUTCDate();
  const months = repeat === "yearly" ? 12 : 3;
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** What's left in the fund after paying the bill from it: any extra stays for the next round. */
export function afterSpending(savedMinor: number, spentMinor: number) {
  return Math.max(0, savedMinor - spentMinor);
}
