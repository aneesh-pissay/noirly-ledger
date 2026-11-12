import type { BudgetPeriod } from "@/src/core/models/enums";
import { periodWindow, type DateRange } from "@/src/core/budgets/period";

/**
 * What a repeating budget does with what's left at the end of a period:
 * nothing (each period starts fresh), carry what's unspent into the next
 * one, or carry both what's unspent and what's overspent (so going over
 * this month leaves less next month).
 */
export const ROLLOVER_MODES = ["none", "unspent", "both"] as const;
export type RolloverMode = (typeof ROLLOVER_MODES)[number];

export const ROLLOVER_LABEL: Record<RolloverMode, string> = {
  none: "Start fresh each period",
  unspent: "Carry over what's unspent",
  both: "Carry over unspent and overspent",
};

/** Custom budgets cover one stretch of dates, so they have nothing to roll into. */
export function canRollOver(period: BudgetPeriod) {
  return period !== "custom";
}

/** Periods are counted back at most this far, so an old budget stays quick to total. */
export const MAX_ROLLOVER_PERIODS = 60;

/**
 * The finished periods from the one containing `since` up to (not including)
 * the one containing `now`, oldest first, capped at the most recent
 * MAX_ROLLOVER_PERIODS.
 */
export function finishedPeriods(period: BudgetPeriod, since: Date, now: Date, fiscalYearStartMonth = 1): DateRange[] {
  if (!canRollOver(period)) return [];
  const current = periodWindow(period, now, undefined, fiscalYearStartMonth);
  const windows: DateRange[] = [];
  let at = since;
  while (at < current.from) {
    const window = periodWindow(period, at, undefined, fiscalYearStartMonth);
    windows.push(window);
    at = new Date(window.to.getTime() + 1);
  }
  return windows.slice(-MAX_ROLLOVER_PERIODS);
}

/**
 * What's carried into the current period from the finished ones, each
 * measured against its own limit (one number when the limit never changed).
 * Unspent-only carry never goes below zero: an overspent period wipes out
 * what had built up, but doesn't take from the next.
 */
export function carriedIn(mode: RolloverMode, limits: number | number[], spentPerPeriod: number[]) {
  if (mode === "none") return 0;
  let carry = 0;
  for (const [i, spent] of spentPerPeriod.entries()) {
    carry += (Array.isArray(limits) ? limits[i] ?? 0 : limits) - spent;
    if (mode === "unspent" && carry < 0) carry = 0;
  }
  return carry;
}
