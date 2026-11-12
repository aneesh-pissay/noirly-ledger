/**
 * Saving together: a goal in a shared (household) workspace that members
 * put money into. Each one's share of what's gone in, and what each has
 * pledged to put in a month, against what they've put in this month.
 */

export type MemberContribution = { userId: string; date: string; amountMinor: number };

export type MemberShare = { userId: string; amountMinor: number; percent: number };

export type PledgeStatus = { userId: string; monthlyMinor: number; thisMonthMinor: number; met: boolean };

/** What each member has put in (less what they took out), biggest first, with their share of the total. */
export function memberShares(contributions: MemberContribution[]): MemberShare[] {
  const totals = new Map<string, number>();
  for (const c of contributions) totals.set(c.userId, (totals.get(c.userId) ?? 0) + c.amountMinor);
  const positive = [...totals].filter(([, amount]) => amount > 0);
  const sum = positive.reduce((s, [, amount]) => s + amount, 0);
  return positive
    .map(([userId, amountMinor]) => ({ userId, amountMinor, percent: sum ? Math.round((amountMinor / sum) * 100) : 0 }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/** Each pledge against what that member has put in this calendar month. */
export function pledgeStatus(pledges: Array<{ userId: string; monthlyMinor: number }>, contributions: MemberContribution[], today: string): PledgeStatus[] {
  const month = today.slice(0, 7);
  return pledges
    .filter((p) => p.monthlyMinor > 0)
    .map((p) => {
      const thisMonthMinor = contributions.filter((c) => c.userId === p.userId && c.date.slice(0, 7) === month).reduce((s, c) => s + c.amountMinor, 0);
      return { userId: p.userId, monthlyMinor: p.monthlyMinor, thisMonthMinor, met: thisMonthMinor >= p.monthlyMinor };
    });
}

/** What everyone's pledges come to a month. */
export function pledgedMonthly(pledges: Array<{ monthlyMinor: number }>) {
  return pledges.reduce((s, p) => s + Math.max(0, p.monthlyMinor), 0);
}
