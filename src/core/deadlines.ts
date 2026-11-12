/**
 * Deadlines for team expenses. Submitting: an expense must go in within so
 * many days of when it was spent, and/or by a day of the following month
 * (the month's close); late, it's flagged for approvers or refused.
 * Approving: a step that has waited too long is late. The daily run first
 * reminds whoever can decide it, then escalates it, letting the workspace's
 * owners decide it too. Each happens once per step.
 */
export type DeadlineSettings = {
  /** Days after the spend date to submit by; null for no limit. */
  submitWithinDays: number | null;
  /** Expenses from one month go in by this day (1–28) of the next; null for no close. */
  monthCloseDay: number | null;
  lateSubmission: "flag" | "block";
  /** Days a step can wait before its approvers are reminded / it's escalated to owners; null for never. */
  remindAfterDays: number | null;
  escalateAfterDays: number | null;
};

export const NO_DEADLINES: DeadlineSettings = { submitWithinDays: null, monthCloseDay: null, lateSubmission: "flag", remindAfterDays: null, escalateAfterDays: null };

const DAY_MS = 86_400_000;

function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The last day an expense spent on `spentOn` can be submitted, or null when there's no deadline. */
export function submissionDeadline(spentOn: string, s: DeadlineSettings): string | null {
  const candidates: string[] = [];
  if (s.submitWithinDays !== null) candidates.push(addDays(spentOn, s.submitWithinDays));
  if (s.monthCloseDay !== null) {
    const [y, m] = spentOn.split("-").map(Number) as [number, number];
    candidates.push(new Date(Date.UTC(y, m, s.monthCloseDay)).toISOString().slice(0, 10));
  }
  return candidates.length ? candidates.sort()[0]! : null;
}

/** How late a submission today is, or null when it's in time. */
export function submissionLateness(spentOn: string, today: string, s: DeadlineSettings): { deadline: string; daysLate: number } | null {
  const deadline = submissionDeadline(spentOn, s);
  if (!deadline || today <= deadline) return null;
  return { deadline, daysLate: Math.round((Date.parse(today) - Date.parse(deadline)) / DAY_MS) };
}

/** Whole days between `since` and `now`. */
export function waitingDays(since: Date | string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY_MS));
}

/** What the daily run does for a waiting step: escalate past that line, else remind past that one; each once. */
export function escalationAction(
  step: { since: Date | string; remindedAt: string | null; escalatedAt: string | null },
  now: Date,
  s: DeadlineSettings,
): "remind" | "escalate" | null {
  const waited = waitingDays(step.since, now);
  if (s.escalateAfterDays !== null && waited >= s.escalateAfterDays && !step.escalatedAt) return "escalate";
  if (s.remindAfterDays !== null && waited >= s.remindAfterDays && !step.remindedAt && !step.escalatedAt) return "remind";
  return null;
}

/** Whether a step has waited past a line (reminder or escalation). */
export function isLate(since: Date | string, now: Date, s: DeadlineSettings): boolean {
  const lines = [s.remindAfterDays, s.escalateAfterDays].filter((n): n is number => n !== null);
  return lines.length > 0 && waitingDays(since, now) >= Math.min(...lines);
}

/** Settings as kept: whole days, a close day 1–28, and the escalation line no earlier than the reminder. */
export function deadlineProblem(s: DeadlineSettings): string | null {
  if (s.monthCloseDay !== null && (s.monthCloseDay < 1 || s.monthCloseDay > 28)) return "The month closes on a day from 1 to 28";
  if (s.remindAfterDays !== null && s.escalateAfterDays !== null && s.escalateAfterDays < s.remindAfterDays) return "Escalate no sooner than the reminder";
  return null;
}
