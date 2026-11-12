/**
 * Where a transaction stands against the bank: pending (not on the statement
 * yet), cleared (it is), or reconciled (checked against a statement balance,
 * and fixed from then on).
 */
export const CLEARING_STATES = ["pending", "cleared", "reconciled"] as const;
export type Clearing = (typeof CLEARING_STATES)[number];

export const CLEARING_LABEL: Record<Clearing, string> = {
  pending: "Pending",
  cleared: "Cleared",
  reconciled: "Reconciled",
};

/** Transactions from before statuses existed count as cleared. */
export function clearingOf(value: string | null | undefined): Clearing {
  return value === "pending" || value === "reconciled" ? value : "cleared";
}

/** What a reconciled transaction keeps fixed: the statement balance was matched on these. */
export const RECONCILED_FIELDS = ["type", "amountMinor", "currency", "date", "accountId", "toAccountId", "toAmountMinor"] as const;

/** The first field a patch would change on a reconciled transaction, or null if the patch is allowed. */
export function reconciledChange(
  clearing: Clearing,
  current: Partial<Record<(typeof RECONCILED_FIELDS)[number], unknown>>,
  patch: Partial<Record<(typeof RECONCILED_FIELDS)[number], unknown>>,
): string | null {
  if (clearing !== "reconciled") return null;
  for (const field of RECONCILED_FIELDS) {
    if (patch[field] !== undefined && String(patch[field] ?? "") !== String(current[field] ?? "")) return field;
  }
  return null;
}

/** What the statement says minus what the cleared transactions add up to; zero means they agree. */
export function reconcileGap(clearedBalanceMinor: number, statementMinor: number) {
  return statementMinor - clearedBalanceMinor;
}
