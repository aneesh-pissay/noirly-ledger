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

export type BalanceEntry = { type: TransactionType; amountMinor: number };

/**
 * An account's balance in its own currency: what's in it for cash, bank and
 * wallet accounts, what's owed for cards and loans. Spending lowers what you
 * have and raises what you owe; income (or a payment to the card) does the
 * opposite. Transfers move nothing until they name both accounts.
 */
export function accountBalance(kind: AccountKind, openingMinor: number, entries: BalanceEntry[]) {
  const sign = isLiability(kind) ? -1 : 1;
  let balance = openingMinor;
  for (const entry of entries) {
    if (entry.type === "income") balance += sign * entry.amountMinor;
    else if (entry.type === "expense") balance -= sign * entry.amountMinor;
  }
  return balance;
}
