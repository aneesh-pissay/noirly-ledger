/**
 * Spending policies: what a workspace allows on submitted expenses. A
 * policy covers some categories (a top-level one covers its subcategories),
 * merchants and pools, or everything when it names none. Within that, it
 * can cap each expense, require a receipt at or above an amount, or not
 * allow the spend at all. Breaking one either flags the expense for its
 * approvers or stops it being submitted. Flags are worked out from the
 * expense as it is now, so attaching a receipt later clears that flag.
 */
export const POLICY_ENFORCEMENTS = ["flag", "block"] as const;
export type PolicyEnforcement = (typeof POLICY_ENFORCEMENTS)[number];

export type SpendingPolicySpec = {
  id: string;
  name: string;
  categoryIds: string[];
  /** Merchant keys (see merchantKey in src/core/labels.ts). */
  merchants: string[];
  budgetPoolIds: string[];
  /** Most one expense may be, in base currency; null for no cap. */
  maxAmountMinor: number | null;
  /** A receipt is needed at or above this, in base currency (0: always); null for never. */
  receiptOverMinor: number | null;
  /** Spend it covers isn't allowed at all. */
  disallowed: boolean;
  enforcement: PolicyEnforcement;
};

/** A policy as listed: the spec, plus merchant names as typed. */
export type SpendingPolicyView = SpendingPolicySpec & { merchantNames: string[] };

export type PolicyFacts = {
  baseAmountMinor: number;
  categoryId: string | null;
  categoryParentId: string | null;
  merchantKey: string | null;
  budgetPoolId: string;
  hasReceipt: boolean;
};

export type PolicyViolationKind = "not_allowed" | "over_limit" | "missing_receipt";

export type PolicyViolation = {
  policyId: string;
  policyName: string;
  kind: PolicyViolationKind;
  enforcement: PolicyEnforcement;
  message: string;
};

export function policyApplies(policy: SpendingPolicySpec, facts: PolicyFacts): boolean {
  if (policy.budgetPoolIds.length && !policy.budgetPoolIds.includes(facts.budgetPoolId)) return false;
  if (policy.categoryIds.length) {
    const own = facts.categoryId !== null && policy.categoryIds.includes(facts.categoryId);
    const parent = facts.categoryParentId !== null && policy.categoryIds.includes(facts.categoryParentId);
    if (!own && !parent) return false;
  }
  if (policy.merchants.length && (facts.merchantKey === null || !policy.merchants.includes(facts.merchantKey))) return false;
  return true;
}

/** Every way an expense breaks the workspace's policies, blocking ones first. */
export function policyViolations(policies: readonly SpendingPolicySpec[], facts: PolicyFacts, money: (minor: number) => string): PolicyViolation[] {
  const out: PolicyViolation[] = [];
  for (const p of policies) {
    if (!policyApplies(p, facts)) continue;
    const base = { policyId: p.id, policyName: p.name, enforcement: p.enforcement };
    if (p.disallowed) {
      out.push({ ...base, kind: "not_allowed", message: `${p.name}: this spend isn't allowed` });
      continue;
    }
    if (p.maxAmountMinor !== null && facts.baseAmountMinor > p.maxAmountMinor) {
      out.push({ ...base, kind: "over_limit", message: `${p.name}: over the ${money(p.maxAmountMinor)} limit by ${money(facts.baseAmountMinor - p.maxAmountMinor)}` });
    }
    if (p.receiptOverMinor !== null && facts.baseAmountMinor >= p.receiptOverMinor && !facts.hasReceipt) {
      out.push({ ...base, kind: "missing_receipt", message: p.receiptOverMinor === 0 ? `${p.name}: needs a receipt` : `${p.name}: needs a receipt from ${money(p.receiptOverMinor)}` });
    }
  }
  return out.sort((a, b) => Number(b.enforcement === "block") - Number(a.enforcement === "block"));
}

export function blocking(violations: readonly PolicyViolation[]) {
  return violations.filter((v) => v.enforcement === "block");
}

/** A policy's rules in words, for the policies list. */
export function describePolicy(p: SpendingPolicySpec, money: (minor: number) => string): string {
  if (p.disallowed) return "Not allowed";
  const parts: string[] = [];
  if (p.maxAmountMinor !== null) parts.push(`up to ${money(p.maxAmountMinor)} each`);
  if (p.receiptOverMinor === 0) parts.push("receipt always");
  else if (p.receiptOverMinor !== null) parts.push(`receipt from ${money(p.receiptOverMinor)}`);
  return parts.length ? parts.join(", ") : "No limits";
}
