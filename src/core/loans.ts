import { installmentSchedule, type ScheduleRow } from "@/src/core/installments";

/**
 * Loans (home, car, education, personal) repaid in EMIs: the same payment
 * each month on a reducing balance, each split into interest and principal.
 * Recording an EMI moves the principal to the loan's account (so what's owed
 * goes down) and counts the interest as spending.
 */

/** Long enough for a 40-year home loan. */
export const MAX_LOAN_MONTHS = 480;

export type LoanRowStatus = "paid" | "overdue" | "upcoming";

export type LoanRow = ScheduleRow & { status: LoanRowStatus };

export type LoanSummary = {
  emiMinor: number;
  paidCount: number;
  monthsLeft: number;
  principalPaidMinor: number;
  interestPaidMinor: number;
  principalLeftMinor: number;
  interestLeftMinor: number;
  /** The total interest over the whole loan. */
  interestTotalMinor: number;
  nextDate: string | null;
  endDate: string;
  overdueCount: number;
};

/** A loan as the app shows it: its terms, where it stands, and its schedule. */
export type LoanView = {
  id: string;
  name: string;
  loanAccountId: string;
  payFromAccountId: string;
  categoryId: string | null;
  principalMinor: number;
  annualRatePct: number;
  months: number;
  firstDate: string;
  currency: string;
  summary: LoanSummary;
  rows: LoanRow[];
};

export function checkLoan(input: { principalMinor: number; months: number; annualRatePct: number }): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(input.principalMinor) || input.principalMinor <= 0) return { ok: false, error: "Enter the amount borrowed, above zero" };
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > MAX_LOAN_MONTHS) return { ok: false, error: `Pick 1 to ${MAX_LOAN_MONTHS} months` };
  if (input.annualRatePct < 0 || input.annualRatePct > 60) return { ok: false, error: "The interest rate should be between 0% and 60% a year" };
  return { ok: true };
}

/** The loan's EMIs month by month (no tax on a loan's interest). */
export function loanSchedule(input: { principalMinor: number; months: number; annualRatePct: number; firstDate: string }) {
  return installmentSchedule({ ...input, taxOnInterestPct: 0 });
}

/**
 * Where a loan stands: EMIs are recorded in order, so the first `paidCount`
 * are paid; an unrecorded one whose date has passed is overdue.
 */
export function loanStatus(rows: ScheduleRow[], paidCount: number, today: string): { rows: LoanRow[]; summary: LoanSummary } {
  const withStatus = rows.map((row): LoanRow => ({ ...row, status: row.number <= paidCount ? "paid" : row.date < today ? "overdue" : "upcoming" }));
  const paid = withStatus.filter((r) => r.status === "paid");
  const left = withStatus.filter((r) => r.status !== "paid");
  const sum = (list: LoanRow[], pick: (r: LoanRow) => number) => list.reduce((s, r) => s + pick(r), 0);
  return {
    rows: withStatus,
    summary: {
      emiMinor: rows[0]?.amountMinor ?? 0,
      paidCount: paid.length,
      monthsLeft: left.length,
      principalPaidMinor: sum(paid, (r) => r.principalMinor),
      interestPaidMinor: sum(paid, (r) => r.interestMinor),
      principalLeftMinor: sum(left, (r) => r.principalMinor),
      interestLeftMinor: sum(left, (r) => r.interestMinor),
      interestTotalMinor: sum(withStatus, (r) => r.interestMinor),
      nextDate: left[0]?.date ?? null,
      endDate: rows.at(-1)?.date ?? "",
      overdueCount: left.filter((r) => r.status === "overdue").length,
    },
  };
}
