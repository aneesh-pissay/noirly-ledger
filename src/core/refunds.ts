import type { TransactionType } from "@/src/core/models/enums";

/**
 * How a transaction counts towards spending: an expense adds to it, a refund
 * takes back part of the expense it reverses, and income and transfers aren't
 * spending at all.
 */
export function spendSign(type: TransactionType): 1 | -1 | 0 {
  if (type === "expense") return 1;
  if (type === "refund") return -1;
  return 0;
}

/** What a refund needs: a posted expense of your own (not a pool's), in its currency, for no more than is left to refund. */
export function checkRefund(input: {
  original: { type: TransactionType; currency: string; amountMinor: number; budgetPoolId: string | null; isPosted: boolean } | null;
  /** Already refunded against the expense, not counting the refund being checked. */
  refundedMinor: number;
  amountMinor: number;
  currency: string;
}): { ok: true } | { ok: false; error: string } {
  const { original } = input;
  if (!original) return { ok: false, error: "A refund needs the expense it reverses" };
  if (original.type !== "expense") return { ok: false, error: "Only an expense can be refunded" };
  if (original.budgetPoolId || !original.isPosted) return { ok: false, error: "Pool expenses can't be refunded here" };
  if (input.currency.toUpperCase() !== original.currency) {
    return { ok: false, error: `The expense was in ${original.currency}; enter the refund in ${original.currency}` };
  }
  const left = original.amountMinor - input.refundedMinor;
  if (input.amountMinor > left) {
    return { ok: false, error: left > 0 ? "That's more than is left to refund" : "This expense is already fully refunded" };
  }
  return { ok: true };
}
