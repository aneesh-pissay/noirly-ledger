import type { MemberRole } from "@/src/core/models/enums";

/**
 * Multi-level approvals: a workspace's rules say which expenses need which
 * chain of approvers. The first rule (in the workspace's order) whose
 * conditions all hold decides; with none, one step any approver can decide.
 * The chain is copied onto the request when it's submitted, so changing the
 * rules later never moves an expense already on its way.
 */

/**
 * Who may decide a step: anyone who decides expenses, an owner, the members
 * named, or the expense's pool's own approvers ("pool", which becomes the
 * people the pool names when the expense is submitted; see src/core/pool-rules.ts).
 */
export const APPROVER_KINDS = ["any", "owners", "members", "pool"] as const;
export type ApproverKind = (typeof APPROVER_KINDS)[number];

export type ApprovalStepSpec = { kind: ApproverKind; userIds: string[] };

export type ApprovalRuleSpec = {
  id: string;
  name: string;
  /** Inclusive bounds on the expense in the workspace's base currency; null is open. */
  minAmountMinor: number | null;
  maxAmountMinor: number | null;
  /** Empty means any. A top-level category covers its subcategories. */
  categoryIds: string[];
  budgetPoolIds: string[];
  steps: ApprovalStepSpec[];
};

export type ExpenseFacts = {
  baseAmountMinor: number;
  categoryId: string | null;
  /** The category's top-level parent, when it's a subcategory. */
  categoryParentId: string | null;
  budgetPoolId: string;
};

export type ApprovalStepDecision = "approved" | "rejected";

/** A step as it stands on a request. */
export type ApprovalStepState = ApprovalStepSpec & {
  decision: ApprovalStepDecision | null;
  decidedById: string | null;
  /** Set when a delegate decided it for someone away: the person they stood in for. */
  onBehalfOfId: string | null;
  decidedAt: string | null;
  note: string | null;
  /** When it became the step waiting to be decided (src/core/deadlines.ts). */
  startedAt: string | null;
  remindedAt: string | null;
  /** Waited too long: the workspace's owners can decide it too. */
  escalatedAt: string | null;
};

/** Someone away, and who decides for them meanwhile (only delegations in effect now). */
export type ActiveDelegation = { fromUserId: string; toUserId: string };

/** Someone in the workspace, and whether their role lets them decide expenses. */
export type Decider = { userId: string; role: MemberRole; canDecide: boolean };

export const DEFAULT_STEPS: readonly ApprovalStepSpec[] = [{ kind: "any", userIds: [] }];

export function ruleMatches(rule: ApprovalRuleSpec, facts: ExpenseFacts): boolean {
  if (rule.minAmountMinor !== null && facts.baseAmountMinor < rule.minAmountMinor) return false;
  if (rule.maxAmountMinor !== null && facts.baseAmountMinor > rule.maxAmountMinor) return false;
  if (rule.budgetPoolIds.length && !rule.budgetPoolIds.includes(facts.budgetPoolId)) return false;
  if (rule.categoryIds.length) {
    const own = facts.categoryId !== null && rule.categoryIds.includes(facts.categoryId);
    const parent = facts.categoryParentId !== null && rule.categoryIds.includes(facts.categoryParentId);
    if (!own && !parent) return false;
  }
  return true;
}

/** The chain an expense needs, and the rule that set it (null for the default single step). */
export function chainFor(
  rules: readonly ApprovalRuleSpec[],
  facts: ExpenseFacts,
): { rule: { id: string; name: string } | null; steps: ApprovalStepSpec[] } {
  const rule = rules.find((r) => r.steps.length > 0 && ruleMatches(r, facts));
  const steps = rule ? rule.steps : DEFAULT_STEPS;
  return {
    rule: rule ? { id: rule.id, name: rule.name } : null,
    steps: steps.map((s) => ({ kind: s.kind, userIds: s.kind === "members" ? [...new Set(s.userIds)] : [] })),
  };
}

/** A fresh, undecided chain. */
export function startSteps(steps: readonly ApprovalStepSpec[], now: string | null = null): ApprovalStepState[] {
  return steps.map((s, i) => ({
    ...s,
    userIds: [...s.userIds],
    decision: null,
    decidedById: null,
    onBehalfOfId: null,
    decidedAt: null,
    note: null,
    startedAt: i === 0 ? now : null,
    remindedAt: null,
    escalatedAt: null,
  }));
}

/**
 * Who a step lets decide, before the own-expense and one-step-each rules. A
 * step naming only people no longer in the workspace falls to its owners,
 * so no expense is left with nobody able to decide it.
 */
export function stepApprovers(step: ApprovalStepSpec & { escalatedAt?: string | null }, members: readonly Decider[]): string[] {
  const owners = members.filter((m) => m.role === "owner").map((m) => m.userId);
  let ids: string[];
  if (step.kind === "owners") ids = owners;
  else if (step.kind === "members") {
    const named = members.filter((m) => step.userIds.includes(m.userId)).map((m) => m.userId);
    ids = named.length ? named : owners;
  } else ids = members.filter((m) => m.canDecide).map((m) => m.userId);
  // Escalated for waiting too long: owners can decide it too.
  return step.escalatedAt ? [...new Set([...ids, ...owners])] : ids;
}

/**
 * Whether `userId` may decide the request's current step. Nobody decides
 * their own expense, and nobody approves two steps of the same one, unless
 * nobody else the step allows could (a team of one or two).
 */
export function mayDecide(
  userId: string,
  request: { submittedById: string; steps: readonly ApprovalStepState[]; currentStep: number },
  members: readonly Decider[],
): boolean {
  const step = request.steps[request.currentStep];
  if (!step || step.decision !== null) return false;
  const eligible = stepApprovers(step, members);
  if (!eligible.includes(userId)) return false;
  const conflicted = conflictsOf(request);
  if (!conflicted(userId)) return true;
  return !eligible.some((id) => id !== userId && !conflicted(id));
}

/** The submitter, and everyone who decided (or was stood in for on) an earlier step. */
function conflictsOf(request: { submittedById: string; steps: readonly ApprovalStepState[]; currentStep: number }) {
  const earlier = new Set(
    request.steps.slice(0, request.currentStep).flatMap((s) => [s.decidedById, s.onBehalfOfId]).filter((id): id is string => id !== null),
  );
  return (id: string) => id === request.submittedById || earlier.has(id);
}

/**
 * Whether `userId` may decide the current step, and for whom: themselves
 * (onBehalfOfId null), or someone away who delegated to them. A delegate
 * stands in for one person only, never for themselves, and the own-expense
 * and one-step-each rules hold for both of them.
 */
export function decideAs(
  userId: string,
  request: { submittedById: string; steps: readonly ApprovalStepState[]; currentStep: number },
  members: readonly Decider[],
  delegations: readonly ActiveDelegation[],
): { onBehalfOfId: string | null } | null {
  if (mayDecide(userId, request, members)) return { onBehalfOfId: null };
  const conflicted = conflictsOf(request);
  if (conflicted(userId)) return null;
  const principal = delegations.find((d) => d.toUserId === userId && d.fromUserId !== userId && mayDecide(d.fromUserId, request, members));
  return principal ? { onBehalfOfId: principal.fromUserId } : null;
}

/**
 * Who to tell that a step is waiting on them: who can decide it (the
 * submitter never), plus the delegates of anyone away among them.
 */
export function stepNotifyIds(
  request: { submittedById: string; steps: readonly ApprovalStepState[]; currentStep: number },
  members: readonly Decider[],
  delegations: readonly ActiveDelegation[] = [],
): string[] {
  const step = request.steps[request.currentStep];
  if (!step) return [];
  const direct = stepApprovers(step, members).filter((id) => mayDecide(id, request, members) && id !== request.submittedById);
  const delegates = delegations
    .filter((d) => direct.includes(d.fromUserId) && decideAs(d.toUserId, request, members, delegations) !== null)
    .map((d) => d.toUserId);
  return [...new Set([...direct, ...delegates])];
}

/** A step in words: "Any approver", "An owner", or the people it names. */
export function describeStep(step: ApprovalStepSpec, nameOf: (userId: string) => string | undefined): string {
  if (step.kind === "any") return "Any approver";
  if (step.kind === "owners") return "An owner";
  if (step.kind === "pool") return "The pool's approvers";
  const names = step.userIds.map(nameOf).filter((n): n is string => Boolean(n));
  return names.length ? names.join(" or ") : "An owner";
}

/** Rule conditions in words, for the rules list. */
export function describeConditions(
  rule: Pick<ApprovalRuleSpec, "minAmountMinor" | "maxAmountMinor" | "categoryIds" | "budgetPoolIds">,
  labels: { money: (minor: number) => string; category: (id: string) => string | undefined; pool: (id: string) => string | undefined },
): string {
  const parts: string[] = [];
  if (rule.minAmountMinor !== null && rule.maxAmountMinor !== null) {
    parts.push(`${labels.money(rule.minAmountMinor)} to ${labels.money(rule.maxAmountMinor)}`);
  } else if (rule.minAmountMinor !== null) {
    parts.push(`${labels.money(rule.minAmountMinor)} or more`);
  } else if (rule.maxAmountMinor !== null) {
    parts.push(`up to ${labels.money(rule.maxAmountMinor)}`);
  }
  const cats = rule.categoryIds.map(labels.category).filter(Boolean);
  if (cats.length) parts.push(`in ${cats.join(", ")}`);
  const pools = rule.budgetPoolIds.map(labels.pool).filter(Boolean);
  if (pools.length) parts.push(`from ${pools.join(", ")}`);
  return parts.length ? `Expenses ${parts.join(", ")}` : "Every expense";
}
