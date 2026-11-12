/**
 * Members paying into a pool, and who's expected to pay what. A pool can
 * split a target (its limit unless one is set) among members: equally,
 * by percentage, or as a fixed amount each. Members record what they put
 * in; the pool's balance is what's been put in less what's been spent.
 * Amounts are in the workspace's base currency.
 */
export const ALLOCATION_MODES = ["none", "equal", "percent", "amount"] as const;
export type AllocationMode = (typeof ALLOCATION_MODES)[number];

export type PoolAllocation = {
  mode: AllocationMode;
  /** What's split; null for the pool's limit. */
  targetMinor: number | null;
  /**
   * Who shares it, and for "percent" (basis points, 10000 = 100%) or
   * "amount" (minor units) how much. For "equal", only who.
   */
  shares: Array<{ userId: string; value: number }>;
};

export const NO_ALLOCATION: PoolAllocation = { mode: "none", targetMinor: null, shares: [] };

/**
 * What each member is expected to put in. An equal split leaves the
 * leftover cents with the first members, so the shares add up exactly.
 */
export function expectedShares(allocation: PoolAllocation, poolLimitMinor: number): Map<string, number> {
  const target = allocation.targetMinor ?? poolLimitMinor;
  const out = new Map<string, number>();
  const people = allocation.shares;
  if (allocation.mode === "none" || !people.length) return out;
  if (allocation.mode === "amount") {
    for (const s of people) out.set(s.userId, s.value);
    return out;
  }
  if (allocation.mode === "percent") {
    for (const s of people) out.set(s.userId, Math.round((target * s.value) / 10_000));
    return out;
  }
  const each = Math.floor(target / people.length);
  let leftover = target - each * people.length;
  for (const s of people) {
    out.set(s.userId, each + (leftover > 0 ? 1 : 0));
    if (leftover > 0) leftover -= 1;
  }
  return out;
}

export type MemberStanding = {
  userId: string;
  expectedMinor: number | null;
  contributedMinor: number;
  /** Still to put in (0 when they've met their share); null without a share. */
  owesMinor: number | null;
};

/** Each member's share, what they've put in, and what's left; everyone with either. */
export function standings(expected: ReadonlyMap<string, number>, contributed: ReadonlyMap<string, number>): MemberStanding[] {
  const ids = [...new Set([...expected.keys(), ...contributed.keys()])];
  return ids
    .map((userId) => {
      const exp = expected.get(userId) ?? null;
      const got = contributed.get(userId) ?? 0;
      return { userId, expectedMinor: exp, contributedMinor: got, owesMinor: exp === null ? null : Math.max(0, exp - got) };
    })
    .sort((a, b) => (b.owesMinor ?? -1) - (a.owesMinor ?? -1) || b.contributedMinor - a.contributedMinor);
}

/** A pool's money in: what's expected of whom, what's been put in, and the balance after spending. */
export type PoolFunding = {
  allocation: PoolAllocation;
  targetMinor: number;
  contributedMinor: number;
  balanceMinor: number;
  standings: Array<MemberStanding & { name: string }>;
  contributions: Array<{ id: string; userId: string; name: string; amountMinor: number; date: string; note: string | null; recordedByName: string; canRemove: boolean }>;
  canManage: boolean;
};

/** What's wrong with an allocation, or null. Percentages must come to 100%. */
export function allocationProblem(allocation: PoolAllocation): string | null {
  if (allocation.mode === "none") return null;
  if (!allocation.shares.length) return "Pick who shares the pool";
  if (new Set(allocation.shares.map((s) => s.userId)).size !== allocation.shares.length) return "Each member once";
  if (allocation.shares.some((s) => s.value < 0)) return "Shares can't be negative";
  if (allocation.mode === "percent" && allocation.shares.reduce((sum, s) => sum + s.value, 0) !== 10_000) return "Percentages have to add up to 100%";
  return null;
}
