/**
 * What a transaction being entered would do to a budget: how much it leaves,
 * and whether that's fine, past the budget's alert threshold, or over.
 */
export type ImpactState = "ok" | "near" | "over";

export function budgetImpact(input: { availableMinor: number; spentMinor: number; addMinor: number; alertThresholdPct: number }) {
  const spentAfter = input.spentMinor + input.addMinor;
  const leftMinor = input.availableMinor - spentAfter;
  let state: ImpactState = "ok";
  if (leftMinor < 0) state = "over";
  else if (input.availableMinor > 0 && spentAfter * 100 >= input.availableMinor * input.alertThresholdPct) state = "near";
  return { leftMinor, state, alreadyOver: input.availableMinor - input.spentMinor < 0 };
}

/** The worst of several impacts, so one message can lead. */
export function worstImpact<T extends { state: ImpactState; leftMinor: number }>(impacts: T[]): T | null {
  const rank = { over: 2, near: 1, ok: 0 } as const;
  return impacts.reduce<T | null>((worst, impact) => {
    if (!worst) return impact;
    if (rank[impact.state] !== rank[worst.state]) return rank[impact.state] > rank[worst.state] ? impact : worst;
    return impact.leftMinor < worst.leftMinor ? impact : worst;
  }, null);
}
