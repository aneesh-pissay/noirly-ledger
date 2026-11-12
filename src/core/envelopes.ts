/**
 * Envelope budgeting on top of accounts. The money in cash, bank and wallet
 * accounts is shared out into envelopes, one per top-level category (spending
 * in a subcategory comes out of its parent's envelope). An envelope holds what
 * was put in less what's been spent from it since envelopes started.
 *
 * Ready to assign is what's left without an envelope: cash on hand, less what's
 * owed on credit cards (card spending has already come out of an envelope but
 * not yet out of an account), less everything sitting in envelopes. Income
 * raises it; spending moves money out of an account and an envelope together,
 * so it doesn't change it. Loans are paid off over time and stay out.
 */

export function envelopeBalance(fundedMinor: number, spentMinor: number) {
  return fundedMinor - spentMinor;
}

export function readyToAssign(input: { cashMinor: number; cardDebtMinor: number; envelopeBalancesMinor: number[] }) {
  const inEnvelopes = input.envelopeBalancesMinor.reduce((sum, value) => sum + value, 0);
  return input.cashMinor - input.cardDebtMinor - inEnvelopes;
}

/**
 * A move of money between envelopes, or between an envelope and Ready to
 * assign (null). It can't move more than the source holds, so nothing goes
 * below zero by moving.
 */
export function checkMove(input: { fromId: string | null; toId: string | null; amountMinor: number; availableMinor: number }): { ok: true } | { ok: false; error: string } {
  if (input.fromId === input.toId) return { ok: false, error: "Pick somewhere different to move it to" };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return { ok: false, error: "Enter an amount above zero" };
  if (input.amountMinor > input.availableMinor) {
    return { ok: false, error: input.fromId ? "That's more than the envelope holds" : "That's more than is ready to assign" };
  }
  return { ok: true };
}
