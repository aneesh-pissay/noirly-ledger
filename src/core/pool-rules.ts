import type { ApprovalStepSpec } from "@/src/core/approval-rules";

/**
 * A pool's own approval rules and spending limits. A pool can name its own
 * approvers: expenses no workspace rule covers go to them, and a rule step
 * can say "the pool's approvers". Small expenses can be approved on their
 * own, up to an amount, but only when no workspace rule applies and nothing
 * is flagged. Each member can spend up to a limit in the pool (a default,
 * or one set for them), per month or over the pool's whole life; what's
 * waiting for approval counts, so submissions can't run past it.
 * Amounts are in the workspace's base currency.
 */
export const MEMBER_LIMIT_PERIODS = ["monthly", "pool"] as const;
export type MemberLimitPeriod = (typeof MEMBER_LIMIT_PERIODS)[number];

export type PoolRules = {
  approverIds: string[];
  /** Approved on its own at or under this; null for never. */
  autoApproveUpToMinor: number | null;
  /** Every member's limit unless set for them; null for none. */
  memberLimitMinor: number | null;
  memberLimits: Array<{ userId: string; limitMinor: number }>;
  memberLimitPeriod: MemberLimitPeriod;
};

export const NO_POOL_RULES: PoolRules = { approverIds: [], autoApproveUpToMinor: null, memberLimitMinor: null, memberLimits: [], memberLimitPeriod: "monthly" };

/** A member's limit in the pool, or null for none. */
export function memberLimitFor(rules: PoolRules, userId: string): number | null {
  return rules.memberLimits.find((l) => l.userId === userId)?.limitMinor ?? rules.memberLimitMinor;
}

/** The days a member's limit runs over (YYYY-MM-DD, inclusive), or null for the pool's whole life. */
export function memberLimitWindow(period: MemberLimitPeriod, spentOn: string): { from: string; to: string } | null {
  if (period === "pool") return null;
  const [y, m] = spentOn.split("-").map(Number) as [number, number];
  return { from: `${spentOn.slice(0, 7)}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** Where a member stands against their limit with `addMinor` more; null when they have none. */
export function memberLimitCheck(limitMinor: number | null, spentMinor: number, addMinor: number) {
  if (limitMinor === null) return null;
  const after = spentMinor + addMinor;
  return { limitMinor, spentMinor, remainingMinor: limitMinor - spentMinor, over: after > limitMinor, overByMinor: Math.max(0, after - limitMinor) };
}

/** Whether an expense is approved on its own: small enough, no workspace rule matched, and nothing flagged. */
export function autoApproves(rules: PoolRules, input: { baseAmountMinor: number; ruleMatched: boolean; flagged: boolean }): boolean {
  return rules.autoApproveUpToMinor !== null && input.baseAmountMinor <= rules.autoApproveUpToMinor && !input.ruleMatched && !input.flagged;
}

/**
 * A chain as submitted: "the pool's approvers" become the people the pool
 * names (any approver when it names none), and with no workspace rule the
 * pool's approvers are the one step.
 */
export function resolvePoolSteps(steps: readonly ApprovalStepSpec[], ruleMatched: boolean, approverIds: readonly string[]): ApprovalStepSpec[] {
  const pool = (): ApprovalStepSpec => (approverIds.length ? { kind: "members", userIds: [...approverIds] } : { kind: "any", userIds: [] });
  if (!ruleMatched) return [pool()];
  return steps.map((s) => (s.kind === "pool" ? pool() : s));
}
