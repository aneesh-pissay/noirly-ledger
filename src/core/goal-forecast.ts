/**
 * Goal milestones and forecasts: when a goal passed a quarter, half and
 * three quarters of the way, how fast money has been going in lately, and
 * when it'll be reached at that pace (against its target date, if it has
 * one).
 */

export const MILESTONES = [25, 50, 75, 100] as const;

/** How far back the pace looks: long enough to smooth out one big month. */
export const PACE_DAYS = 90;

const MONTH_DAYS = 30.44;

export type Contribution = { date: string; amountMinor: number };

export type GoalForecast = {
  milestones: Array<{ percent: number; amountMinor: number; reachedOn: string | null; reached: boolean }>;
  /** What's gone in a month lately. */
  paceMinor: number;
  /** When it'll be reached at that pace; null when nothing's going in. */
  projectedDate: string | null;
  /** What it takes a month from now to reach it by the target date. */
  neededMonthlyMinor: number | null;
  /** Reaching it by the target date at this pace (null without a target date). */
  onTrack: boolean | null;
};

function days(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

/** The milestones a contribution crossed, going from `before` to `after` saved. */
export function milestonesCrossed(targetMinor: number, beforeMinor: number, afterMinor: number) {
  return MILESTONES.filter((p) => {
    const mark = (targetMinor * p) / 100;
    return beforeMinor < mark && afterMinor >= mark;
  });
}

/**
 * When each milestone was reached, from the contributions in order. Money
 * that was there before contributions were logged counts from the start
 * (its milestones are reached, with no date).
 */
export function milestones(targetMinor: number, currentMinor: number, contributions: Contribution[]) {
  const sorted = [...contributions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const logged = sorted.reduce((sum, c) => sum + c.amountMinor, 0);
  let running = currentMinor - logged;
  const reachedOn = new Map<number, string | null>();
  for (const p of MILESTONES) if (running >= (targetMinor * p) / 100) reachedOn.set(p, null);
  for (const c of sorted) {
    const before = running;
    running += c.amountMinor;
    for (const p of milestonesCrossed(targetMinor, before, running)) if (!reachedOn.has(p)) reachedOn.set(p, c.date);
  }
  return MILESTONES.map((percent) => ({
    percent,
    amountMinor: Math.round((targetMinor * percent) / 100),
    // Taking money out can drop it back below a milestone it once passed.
    reached: currentMinor >= (targetMinor * percent) / 100,
    reachedOn: currentMinor >= (targetMinor * percent) / 100 ? (reachedOn.get(percent) ?? null) : null,
  }));
}

/**
 * What's gone in a month lately: over the last 90 days, or since the first
 * contribution if that's more recent (but at least a month, so one
 * contribution yesterday doesn't look like a huge pace).
 */
export function monthlyPace(contributions: Contribution[], today: string) {
  const recent = contributions.filter((c) => days(c.date, today) <= PACE_DAYS && days(c.date, today) >= 0);
  if (!recent.length) return 0;
  const first = recent.reduce((min, c) => (c.date < min ? c.date : min), today);
  const span = Math.max(MONTH_DAYS, Math.min(PACE_DAYS, days(first, today)));
  const total = recent.reduce((sum, c) => sum + c.amountMinor, 0);
  return Math.max(0, Math.round((total / span) * MONTH_DAYS));
}

export function forecastGoal(goal: { targetMinor: number; currentMinor: number; targetDate: string | null }, contributions: Contribution[], today: string): GoalForecast {
  const remaining = Math.max(0, goal.targetMinor - goal.currentMinor);
  const paceMinor = monthlyPace(contributions, today);
  const projectedDate = remaining === 0 ? today : paceMinor > 0 ? addDays(today, (remaining / paceMinor) * MONTH_DAYS) : null;
  let neededMonthlyMinor: number | null = null;
  let onTrack: boolean | null = null;
  if (goal.targetDate) {
    const left = days(today, goal.targetDate);
    // Rounded up to a whole unit, as you'd set it aside.
    neededMonthlyMinor = remaining === 0 ? 0 : left <= 0 ? remaining : Math.ceil(remaining / Math.max(1, left / MONTH_DAYS) / 100) * 100;
    onTrack = remaining === 0 || (projectedDate != null && projectedDate <= goal.targetDate);
  }
  return { milestones: milestones(goal.targetMinor, goal.currentMinor, contributions), paceMinor, projectedDate, neededMonthlyMinor, onTrack };
}
