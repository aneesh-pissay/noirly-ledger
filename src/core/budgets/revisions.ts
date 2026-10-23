import type { BudgetPeriod } from "@/src/core/models/enums";

/**
 * Every change to a budget's limit is kept as a revision: when it was
 * created, edited, had money moved in or out, was set by a template, was
 * restored to an earlier limit, or was deleted.
 */
export const REVISION_REASONS = ["created", "edited", "moved_in", "moved_out", "template", "restored", "deleted"] as const;
export type RevisionReason = (typeof REVISION_REASONS)[number];

export const REVISION_LABEL: Record<RevisionReason, string> = {
  created: "Created",
  edited: "Changed",
  moved_in: "Money moved in",
  moved_out: "Money moved out",
  template: "Set by a template",
  restored: "Restored",
  deleted: "Deleted",
};

/**
 * The limit a budget had at a moment: the latest revision made by then, or
 * the earliest one's starting limit before any (so periods before the first
 * recorded change use the limit it was created with). `current` covers a
 * budget with no revisions at all.
 */
export function limitAt(revisions: Array<{ at: Date; previousLimitMinor: number | null; limitMinor: number | null }>, at: Date, current: number) {
  const sorted = [...revisions].sort((a, b) => a.at.getTime() - b.at.getTime());
  let limit: number | null = null;
  for (const revision of sorted) {
    if (revision.at.getTime() > at.getTime()) break;
    limit = revision.limitMinor;
  }
  if (limit != null) return limit;
  const first = sorted[0];
  if (first && first.at.getTime() > at.getTime()) return first.previousLimitMinor ?? first.limitMinor ?? current;
  return current;
}

/**
 * Moving part of one budget's limit to another: both repeat over the same
 * kind of period (so the amount means the same in each), and the source keeps
 * a limit of zero or more.
 */
export function checkBudgetMove(input: {
  from: { id: string; period: BudgetPeriod; limitMinor: number; currency: string } | null;
  to: { id: string; period: BudgetPeriod; currency: string } | null;
  amountMinor: number;
}): { ok: true } | { ok: false; error: string } {
  if (!input.from || !input.to) return { ok: false, error: "Pick a budget to move from and one to move to" };
  if (input.from.id === input.to.id) return { ok: false, error: "Pick two different budgets" };
  if (input.from.period !== input.to.period) return { ok: false, error: `Both budgets need the same period; one is ${input.from.period}, the other ${input.to.period}` };
  if (input.from.currency !== input.to.currency) return { ok: false, error: "Both budgets need the same currency" };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return { ok: false, error: "Enter an amount above zero" };
  if (input.amountMinor > input.from.limitMinor) return { ok: false, error: "That's more than the budget's whole limit" };
  return { ok: true };
}
