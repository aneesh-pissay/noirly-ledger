import { emiAmount } from "@/src/core/installments";

/**
 * Paying off debt: what's owed on loans and cards, and how fast it goes
 * under three plans. "Minimums" pays only each debt's minimum. Snowball and
 * avalanche pay the same total every month (minimums plus any extra): the
 * extra goes to one debt at a time, the smallest balance first (snowball,
 * for quick wins) or the highest rate first (avalanche, for the least
 * interest), and a paid-off debt's minimum rolls on to the next.
 */

export type Debt = {
  id: string;
  name: string;
  balanceMinor: number;
  annualRatePct: number;
  /** The least to pay each month (a loan's EMI, a card's minimum due). */
  minimumMinor: number;
};

/** A debt as the plan page shows it: amounts in the base currency, and whether its own terms are known. */
export type DebtView = Debt & {
  kind: "loan" | "card";
  /** The account's own currency (amounts here are in the base one). */
  currency: string;
  /** Its rate and EMI come from the loan's repayment schedule. */
  fromSchedule: boolean;
  /** A loan without a schedule: type in its rate and EMI. */
  needsTerms: boolean;
};

export const DEBT_STRATEGIES = ["minimum", "snowball", "avalanche"] as const;
export type DebtStrategy = (typeof DEBT_STRATEGIES)[number];

export type DebtPlanResult = {
  strategy: DebtStrategy;
  /** Months until everything's paid; null if it never is (minimums below the interest). */
  months: number | null;
  totalInterestMinor: number;
  /** The month (1 = this coming month) each debt is paid off, in the order they go. */
  payoffs: Array<{ id: string; name: string; month: number }>;
  /** What's owed in all at the end of each month. */
  timeline: number[];
};

/** Fifty years: past this a plan doesn't pay off. */
export const MAX_PLAN_MONTHS = 600;

/** The debt the extra goes to next under a plan. */
function target(strategy: DebtStrategy, open: Array<Debt & { left: number }>) {
  const sorted = [...open].sort((a, b) =>
    strategy === "avalanche" ? b.annualRatePct - a.annualRatePct || a.left - b.left : a.left - b.left || b.annualRatePct - a.annualRatePct,
  );
  return sorted[0];
}

/** Month by month: interest on each balance, minimums on each, and the rest to the target debt. */
export function simulateDebts(debts: Debt[], strategy: DebtStrategy, extraMinor = 0): DebtPlanResult {
  const state = debts.filter((d) => d.balanceMinor > 0).map((d) => ({ ...d, left: d.balanceMinor }));
  // Snowball and avalanche keep paying the same total as debts close; minimums only stop paying a closed debt.
  const budget = state.reduce((sum, d) => sum + d.minimumMinor, 0) + (strategy === "minimum" ? 0 : Math.max(0, extraMinor));
  const payoffs: DebtPlanResult["payoffs"] = [];
  const timeline: number[] = [];
  let totalInterestMinor = 0;
  let month = 0;
  while (state.some((d) => d.left > 0) && month < MAX_PLAN_MONTHS) {
    month++;
    const open = state.filter((d) => d.left > 0);
    for (const d of open) {
      const interest = Math.round((d.left * d.annualRatePct) / 1200);
      d.left += interest;
      totalInterestMinor += interest;
    }
    let money = strategy === "minimum" ? open.reduce((sum, d) => sum + d.minimumMinor, 0) : budget;
    for (const d of open) {
      const pay = Math.min(d.left, d.minimumMinor, money);
      d.left -= pay;
      money -= pay;
    }
    // What's left of the budget goes to the plan's target, then the next, until it's spent.
    while (strategy !== "minimum" && money > 0) {
      const next = target(strategy, state.filter((d) => d.left > 0));
      if (!next) break;
      const pay = Math.min(next.left, money);
      next.left -= pay;
      money -= pay;
    }
    for (const d of open) if (d.left === 0) payoffs.push({ id: d.id, name: d.name, month });
    timeline.push(state.reduce((sum, d) => sum + d.left, 0));
  }
  return { strategy, months: state.some((d) => d.left > 0) ? null : month, totalInterestMinor, payoffs, timeline };
}

export type PrepaymentInput = {
  balanceMinor: number;
  annualRatePct: number;
  emiMinor: number;
  monthsLeft: number;
};

export type Prepayment = {
  /** Paid once, with the EMI of month `atMonth` (1 = the next EMI). */
  lumpSumMinor: number;
  atMonth: number;
  /** Paid on top of every EMI from the next one. */
  extraMonthlyMinor: number;
  /** After a lump sum, keep the EMI and finish sooner, or keep the end date and pay a smaller EMI. */
  mode: "tenure" | "emi";
};

export type PrepaymentResult = {
  before: { months: number; interestMinor: number };
  after: { months: number; interestMinor: number; emiMinor: number };
  savedInterestMinor: number;
  savedMonths: number;
};

/** A loan's remaining months, prepaying or not; interest is charged on the reducing balance each month. */
export function simulatePrepayment(loan: PrepaymentInput, plan: Prepayment): PrepaymentResult {
  const r = loan.annualRatePct / 1200;
  const run = (prepay: boolean) => {
    let balance = loan.balanceMinor;
    let emi = loan.emiMinor;
    let interestMinor = 0;
    let month = 0;
    while (balance > 0 && month < MAX_PLAN_MONTHS) {
      month++;
      const interest = Math.round(balance * r);
      interestMinor += interest;
      balance += interest;
      // The last scheduled EMI takes up any rounding, as a lender's schedule does.
      balance -= month >= loan.monthsLeft ? balance : Math.min(balance, emi + (prepay ? plan.extraMonthlyMinor : 0));
      if (prepay && month === plan.atMonth && plan.lumpSumMinor > 0 && balance > 0) {
        balance -= Math.min(balance, plan.lumpSumMinor);
        // Lowering the EMI keeps the original end date: spread what's left over the months that were left.
        if (plan.mode === "emi" && balance > 0) emi = Math.round(emiAmount(balance, Math.max(1, loan.monthsLeft - month), loan.annualRatePct));
      }
    }
    return { months: month, interestMinor, emiMinor: emi };
  };
  const before = run(false);
  const after = run(true);
  return {
    before: { months: before.months, interestMinor: before.interestMinor },
    after,
    savedInterestMinor: before.interestMinor - after.interestMinor,
    savedMonths: before.months - after.months,
  };
}

/** A card's minimum due when none is known: the usual 5% of what's owed, at least ₹200 on a rupee card (2 units in other currencies). */
export function defaultCardMinimum(balanceMinor: number, currency: string) {
  const floor = currency === "INR" ? 20_000 : 200;
  return Math.min(balanceMinor, Math.max(floor, Math.round(balanceMinor * 0.05)));
}

/** A card's yearly rate when none is known: Indian cards charge about 3.5% a month. */
export const DEFAULT_CARD_RATE_PCT = 42;
