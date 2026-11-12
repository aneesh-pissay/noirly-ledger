/**
 * How long a workspace keeps what it no longer uses, and deleting it
 * outright. Each rule is off until someone who runs the workspace sets it:
 * - deleted transactions (already out of every list and total) go for good,
 *   with their receipt files, comments and change history;
 * - receipts still waiting to be matched go, with their files;
 * - notifications about the workspace go, for everyone.
 * The audit history is never shortened: it goes only with the workspace.
 */

export const RETENTION_CHOICES = [30, 90, 365] as const;
export type RetentionDays = (typeof RETENTION_CHOICES)[number] | null;

export type RetentionPolicy = {
  deletedTransactionsDays: RetentionDays;
  unmatchedReceiptsDays: RetentionDays;
  notificationsDays: RetentionDays;
};

export const DEFAULT_RETENTION: RetentionPolicy = { deletedTransactionsDays: null, unmatchedReceiptsDays: null, notificationsDays: null };

export const RETENTION_LABEL: Record<keyof RetentionPolicy, string> = {
  deletedTransactionsDays: "Deleted transactions",
  unmatchedReceiptsDays: "Receipts never matched",
  notificationsDays: "Notifications",
};

export function retentionProblem(p: RetentionPolicy): string | null {
  for (const value of Object.values(p)) {
    if (value !== null && !(RETENTION_CHOICES as readonly number[]).includes(value)) return "Keep things 30, 90 or 365 days, or for good";
  }
  return null;
}

/** Anything from before this goes; null when the rule is off. */
export function cutoff(days: RetentionDays, now: Date): Date | null {
  return days === null ? null : new Date(now.getTime() - days * 86_400_000);
}

export function anyRule(p: Partial<RetentionPolicy> | null | undefined) {
  return Boolean(p && (p.deletedTransactionsDays || p.unmatchedReceiptsDays || p.notificationsDays));
}

/** Deleting a workspace takes typing its name, exactly (spaces at the ends aside). */
export function confirmsName(typed: string, name: string) {
  return typed.trim() === name.trim() && name.trim().length > 0;
}
