import type { TransactionType } from "@/src/core/models/enums";

export const ACCOUNT_KINDS = ["cash", "bank", "wallet", "credit_card", "loan"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "Cash",
  bank: "Bank account",
  wallet: "Wallet",
  credit_card: "Credit card",
  loan: "Loan",
};

/** Money you owe rather than money you have. Their balance is the amount owed. */
export const LIABILITY_KINDS: readonly AccountKind[] = ["credit_card", "loan"];

export function isLiability(kind: AccountKind) {
  return LIABILITY_KINDS.includes(kind);
}

/**
 * Money moving through an account: income in, spending out, or one side of a
 * transfer ("in" to this account, "out" of it). Amounts are in the account's currency.
 */
export type BalanceEntry = { type: TransactionType | "transfer_in" | "transfer_out"; amountMinor: number };

/**
 * An account's balance in its own currency: what's in it for cash, bank and
 * wallet accounts, what's owed for cards and loans. Money in (income, a
 * refund, a transfer in) raises what you have and lowers what you owe: paying a card
 * from the bank is a transfer into the card. Money out does the opposite: a
 * cash withdrawal on a card is a transfer out that adds to what's owed.
 * An old-style transfer without accounts on both sides moves nothing.
 */
export function accountBalance(kind: AccountKind, openingMinor: number, entries: BalanceEntry[]) {
  const sign = isLiability(kind) ? -1 : 1;
  let balance = openingMinor;
  for (const entry of entries) {
    if (entry.type === "income" || entry.type === "refund" || entry.type === "transfer_in") balance += sign * entry.amountMinor;
    else if (entry.type === "expense" || entry.type === "transfer_out") balance -= sign * entry.amountMinor;
  }
  return balance;
}

/** What a transfer needs: two different accounts, and the amount received when their currencies differ. */
export function checkTransfer(input: {
  from: { id: string; currency: string } | null;
  to: { id: string; currency: string } | null;
  amountMinor: number;
  toAmountMinor: number | null | undefined;
}): { ok: true; toAmountMinor: number } | { ok: false; error: string } {
  if (!input.from || !input.to) return { ok: false, error: "A transfer needs an account to move money from and one to move it to" };
  if (input.from.id === input.to.id) return { ok: false, error: "Pick two different accounts" };
  if (input.from.currency === input.to.currency) {
    if (input.toAmountMinor != null && input.toAmountMinor !== input.amountMinor) {
      return { ok: false, error: "Both accounts use the same currency, so the amount received is the amount sent" };
    }
    return { ok: true, toAmountMinor: input.amountMinor };
  }
  if (input.toAmountMinor == null || input.toAmountMinor <= 0) {
    return { ok: false, error: `Enter the amount received in ${input.to.currency}` };
  }
  return { ok: true, toAmountMinor: input.toAmountMinor };
}
