import type { ActiveDelegation } from "@/src/core/approval-rules";

/**
 * Delegated approval: someone going away names a member to decide for them
 * from one day to another (inclusive, YYYY-MM-DD). The delegate decides
 * what the person away could, on their behalf; the person away can still
 * decide too. Ending a delegation early stops it at once.
 */
export type DelegationWindow = {
  fromUserId: string;
  toUserId: string;
  startsOn: string;
  endsOn: string;
  endedAt: string | null;
};

export type DelegationState = "upcoming" | "active" | "over";

/** A delegation as listed, with names. */
export type DelegationView = DelegationWindow & { id: string; fromName: string; toName: string; note: string | null; state: DelegationState };

export function delegationState(d: DelegationWindow, today: string): DelegationState {
  if (d.endedAt || today > d.endsOn) return "over";
  return today < d.startsOn ? "upcoming" : "active";
}

/** The delegations in effect on `today`. */
export function activeDelegations(list: readonly DelegationWindow[], today: string): ActiveDelegation[] {
  return list.filter((d) => delegationState(d, today) === "active").map((d) => ({ fromUserId: d.fromUserId, toUserId: d.toUserId }));
}

/** What's wrong with a new delegation, or null when it's fine. */
export function delegationProblem(
  input: { fromUserId: string; toUserId: string; startsOn: string; endsOn: string },
  today: string,
  existing: readonly DelegationWindow[],
): string | null {
  if (input.fromUserId === input.toUserId) return "Pick someone other than yourself";
  if (input.endsOn < input.startsOn) return "The last day is before the first";
  if (input.endsOn < today) return "Those days are already over";
  // One stand-in at a time: two would leave it unclear who decides.
  const overlaps = existing.some(
    (d) => d.fromUserId === input.fromUserId && delegationState(d, today) !== "over" && d.startsOn <= input.endsOn && input.startsOn <= d.endsOn,
  );
  if (overlaps) return "You already have someone covering some of those days";
  return null;
}

/** What an approval history entry records. */
export const APPROVAL_EVENT_KINDS = [
  "submitted",
  "approved",
  "rejected",
  "withdrawn",
  "paid",
  "unpaid",
  "reminded",
  "escalated",
  "delegation.started",
  "delegation.ended",
] as const;
export type ApprovalEventKind = (typeof APPROVAL_EVENT_KINDS)[number];

/** One entry in the approval history, with names filled in. */
export type ApprovalEventView = {
  id: string;
  kind: ApprovalEventKind;
  approvalId: string | null;
  /** Null when Ledger did it (a reminder or an escalation). */
  actorId: string | null;
  actorName: string;
  /** For a decision a delegate made: the person away. For a delegation: the delegate. For a payout: who was paid. */
  otherUserId: string | null;
  otherName: string | null;
  /** The step decided (0-based), and how many there were. */
  step: number | null;
  stepCount: number | null;
  note: string | null;
  /** The expense's note and amount, for reading the history on its own. */
  summary: string | null;
  at: string;
};

/** An entry in words, for the history list. */
export function describeEvent(e: ApprovalEventView): string {
  const step = e.step !== null && e.stepCount !== null && e.stepCount > 1 ? ` (step ${e.step + 1} of ${e.stepCount})` : "";
  const forWhom = e.otherName ? `, for ${e.otherName}` : "";
  const what = e.summary ? ` ${e.summary}` : " an expense";
  switch (e.kind) {
    case "submitted":
      return `${e.actorName} submitted${what}`;
    case "approved":
      return `${e.actorName} approved${what}${step}${forWhom}`;
    case "rejected":
      return `${e.actorName} rejected${what}${step}${forWhom}`;
    case "withdrawn":
      return `${e.actorName} withdrew${what}`;
    case "paid":
      return `${e.actorName} paid ${e.otherName ?? "someone"} back for${what}`;
    case "unpaid":
      return `${e.actorName} undid paying ${e.otherName ?? "someone"} back for${what}`;
    case "reminded":
      return `Approvers reminded about${what}${step}`;
    case "escalated":
      return `Escalated${what}${step} to the owners`;
    case "delegation.started":
      return `${e.actorName} asked ${e.otherName ?? "someone"} to approve for them${e.note ? ` (${e.note})` : ""}`;
    case "delegation.ended":
      return `${e.actorName} ended ${e.otherName ?? "someone"}'s cover`;
  }
}
