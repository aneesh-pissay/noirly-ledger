/**
 * Reimbursements: an expense someone paid out of their own pocket, which the
 * workspace pays back. It's asked for when the expense is submitted, owed
 * once the expense is approved, and paid when a payer records a payout to
 * the person (one payout can settle several). Rejected or withdrawn, it's
 * void. Amounts are in the workspace's base currency, as approved.
 */
export const REIMBURSEMENT_STATUSES = ["pending", "owed", "paid", "void"] as const;
export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUSES)[number];

export const PAYOUT_METHODS = ["bank", "upi", "cash", "other"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  bank: "Bank transfer",
  upi: "UPI",
  cash: "Cash",
  other: "Other",
};

/** Where a reimbursement goes when its expense is decided or withdrawn. */
export function statusAfter(event: "approved" | "rejected" | "withdrawn"): ReimbursementStatus {
  return event === "approved" ? "owed" : "void";
}

export type ReimbursementView = {
  id: string;
  transactionId: string;
  approvalId: string;
  claimantId: string;
  claimantName: string;
  status: ReimbursementStatus;
  /** What it's paid back as, in the base currency. */
  amountMinor: number;
  currency: string;
  /** As spent, when that was another currency. */
  spentMinor: number;
  spentCurrency: string;
  note: string | null;
  date: string;
  payoutId: string | null;
  paidOn: string | null;
};

export type PayoutView = {
  id: string;
  claimantId: string;
  claimantName: string;
  paidById: string;
  paidByName: string;
  amountMinor: number;
  currency: string;
  method: PayoutMethod;
  reference: string | null;
  paidOn: string;
  count: number;
  undoneAt: string | null;
};

/** What's owed, per person, largest first. */
export function owedByClaimant(items: readonly Pick<ReimbursementView, "claimantId" | "claimantName" | "status" | "amountMinor" | "id">[]) {
  const by = new Map<string, { claimantId: string; claimantName: string; totalMinor: number; ids: string[] }>();
  for (const r of items) {
    if (r.status !== "owed") continue;
    const row = by.get(r.claimantId) ?? { claimantId: r.claimantId, claimantName: r.claimantName, totalMinor: 0, ids: [] };
    row.totalMinor += r.amountMinor;
    row.ids.push(r.id);
    by.set(r.claimantId, row);
  }
  return [...by.values()].sort((a, b) => b.totalMinor - a.totalMinor || a.claimantName.localeCompare(b.claimantName));
}

/** What's wrong with paying these out together, or null: all owed, to one person, none twice. */
export function payoutProblem(items: readonly Pick<ReimbursementView, "id" | "status" | "claimantId">[], requestedIds: readonly string[]): string | null {
  if (!requestedIds.length) return "Pick at least one to pay";
  if (new Set(requestedIds).size !== requestedIds.length) return "Each one once";
  if (items.length !== requestedIds.length) return "Some of those aren't in this workspace";
  if (items.some((r) => r.status !== "owed")) return "Only what's owed can be paid; some of those aren't";
  if (new Set(items.map((r) => r.claimantId)).size > 1) return "One payout goes to one person";
  return null;
}
