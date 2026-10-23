/**
 * Installment (EMI) purchases: a price paid over a number of months. With an
 * interest rate, each month's payment is the same EMI (equated monthly
 * installment) on a reducing balance; with none, it's a no-cost EMI split
 * evenly. In India, GST is charged on the interest part, so a tax rate on
 * interest is added to each month. A processing fee, if any, is paid with the
 * first installment.
 */

export type ScheduleInput = {
  principalMinor: number;
  months: number;
  /** Yearly interest rate in percent; 0 for a no-cost EMI. */
  annualRatePct: number;
  /** Tax on the interest part in percent (18 for GST in India); 0 for none. */
  taxOnInterestPct: number;
  /** YYYY-MM-DD of the first installment; later ones fall on the same day of each month (or the month's last day). */
  firstDate: string;
};

export type ScheduleRow = {
  number: number;
  date: string;
  principalMinor: number;
  interestMinor: number;
  taxMinor: number;
  /** What's paid that month: principal, interest and tax. */
  amountMinor: number;
  /** Principal still owed after it. */
  balanceMinor: number;
};

export const MAX_INSTALLMENTS = 120;

/** The same day each month from the first, kept to the month's last day in short months. */
export function installmentDate(firstDate: string, index: number) {
  const [year, month, day] = firstDate.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + index, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** The month's payment on a reducing balance: P·r·(1+r)^n / ((1+r)^n − 1), or P/n with no interest. */
export function emiAmount(principalMinor: number, months: number, annualRatePct: number) {
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principalMinor / months;
  const growth = (1 + r) ** months;
  return (principalMinor * r * growth) / (growth - 1);
}

/**
 * Month by month: interest on what's still owed, the rest of the EMI paying
 * down principal, tax on the interest. Amounts are whole minor units and the
 * principal parts add up to the price exactly (the last month takes up any
 * rounding).
 */
export function installmentSchedule(input: ScheduleInput): ScheduleRow[] {
  const { principalMinor, months, annualRatePct, taxOnInterestPct } = input;
  const r = annualRatePct / 12 / 100;
  const emi = emiAmount(principalMinor, months, annualRatePct);
  const rows: ScheduleRow[] = [];
  let balance = principalMinor;
  for (let n = 1; n <= months; n++) {
    const interestMinor = Math.round(balance * r);
    const principal = n === months ? balance : Math.min(balance, Math.round(emi - balance * r));
    balance -= principal;
    const taxMinor = Math.round((interestMinor * taxOnInterestPct) / 100);
    rows.push({
      number: n,
      date: installmentDate(input.firstDate, n - 1),
      principalMinor: principal,
      interestMinor,
      taxMinor,
      amountMinor: principal + interestMinor + taxMinor,
      balanceMinor: balance,
    });
  }
  return rows;
}

export function scheduleSummary(rows: ScheduleRow[], processingFeeMinor = 0) {
  const sum = (pick: (row: ScheduleRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const interestMinor = sum((r) => r.interestMinor);
  const taxMinor = sum((r) => r.taxMinor);
  return {
    monthlyMinor: rows[0]?.amountMinor ?? 0,
    interestMinor,
    taxMinor,
    processingFeeMinor,
    /** Everything paid over the plan, fee included. */
    totalMinor: sum((r) => r.amountMinor) + processingFeeMinor,
    costMinor: interestMinor + taxMinor + processingFeeMinor,
  };
}

export function checkPlan(input: { principalMinor: number; months: number; annualRatePct: number; taxOnInterestPct: number }): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(input.principalMinor) || input.principalMinor <= 0) return { ok: false, error: "Enter the price above zero" };
  if (!Number.isInteger(input.months) || input.months < 2 || input.months > MAX_INSTALLMENTS) return { ok: false, error: `Pick 2 to ${MAX_INSTALLMENTS} months` };
  if (input.annualRatePct < 0 || input.annualRatePct > 60) return { ok: false, error: "The interest rate should be between 0% and 60% a year" };
  if (input.taxOnInterestPct < 0 || input.taxOnInterestPct > 50) return { ok: false, error: "The tax on interest should be between 0% and 50%" };
  return { ok: true };
}
