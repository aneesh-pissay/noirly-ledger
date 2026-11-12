import type { BudgetPeriod } from "@/src/core/models/enums";

/**
 * Zero-based budgeting: every unit of the month's income gets a job. The
 * month's plan is its income (what's expected, or what's arrived when nothing
 * is expected) less what the budgets assign for the month; the aim is zero
 * left to assign.
 */

/**
 * What a budget assigns in one month: a monthly limit as it is, a weekly one
 * over the 52/12 weeks in an average month, a yearly one a twelfth. A custom
 * budget covers its own dates, so it isn't part of a monthly plan.
 */
export function monthlyEquivalent(period: BudgetPeriod, limitMinor: number): number | null {
  if (period === "monthly") return limitMinor;
  if (period === "weekly") return Math.round((limitMinor * 52) / 12);
  if (period === "yearly") return Math.round(limitMinor / 12);
  return null;
}

export type PlanState = "balanced" | "unassigned" | "overassigned";

export function planSummary(incomeMinor: number, assignedMinor: number[]) {
  const assigned = assignedMinor.reduce((sum, value) => sum + value, 0);
  const leftMinor = incomeMinor - assigned;
  const state: PlanState = leftMinor === 0 ? "balanced" : leftMinor > 0 ? "unassigned" : "overassigned";
  return { assignedMinor: assigned, leftMinor, state };
}

/** The calendar month a day is in, as YYYY-MM, with its first and last days. */
export function monthOf(day: string) {
  const [year, month] = day.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return { key, from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}
