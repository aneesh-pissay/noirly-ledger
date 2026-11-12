/**
 * Department, team and project budgets. A department can hold teams (one
 * level: a team's parent is a department). Each can have a budget for the
 * month, the quarter or the year (quarters and years follow the workspace's
 * financial year); a department's spending includes its teams'. A project's
 * budget is for its whole life. Spending is posted expenses net of refunds,
 * in base currency.
 */
export const GROUP_PERIODS = ["monthly", "quarterly", "yearly"] as const;
export type GroupPeriod = (typeof GROUP_PERIODS)[number];

export const GROUP_PERIOD_LABEL: Record<GroupPeriod, string> = { monthly: "a month", quarterly: "a quarter", yearly: "a year" };

/** The period `at` falls in, as [from, to] UTC days (YYYY-MM-DD, inclusive). */
export function groupPeriodWindow(period: GroupPeriod, at: Date, fiscalYearStartMonth = 1): { from: string; to: string } {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() + 1;
  const day = (year: number, month: number, d: number) => new Date(Date.UTC(year, month - 1, d)).toISOString().slice(0, 10);
  if (period === "monthly") return { from: day(y, m, 1), to: day(y, m + 1, 0) };
  // Months since the financial year began, 0–11.
  const into = (m - fiscalYearStartMonth + 12) % 12;
  const fyStartYear = m >= fiscalYearStartMonth ? y : y - 1;
  if (period === "yearly") return { from: day(fyStartYear, fiscalYearStartMonth, 1), to: day(fyStartYear, fiscalYearStartMonth + 12, 0) };
  const qStartMonth = fiscalYearStartMonth + Math.floor(into / 3) * 3;
  return { from: day(fyStartYear, qStartMonth, 1), to: day(fyStartYear, qStartMonth + 3, 0) };
}

export type BudgetState = "none" | "ok" | "near" | "over";

/** Where spending stands against a budget; "near" from the alert line, "over" past the budget. */
export function budgetState(spentMinor: number, budgetMinor: number | null, alertPct: number) {
  if (budgetMinor === null || budgetMinor <= 0) return { state: "none" as BudgetState, remainingMinor: null, pct: null };
  const pct = Math.round((spentMinor / budgetMinor) * 100);
  const state: BudgetState = spentMinor > budgetMinor ? "over" : spentMinor >= Math.round((budgetMinor * alertPct) / 100) ? "near" : "ok";
  return { state, remainingMinor: budgetMinor - spentMinor, pct };
}

/** Whether adding spend crossed the alert line or the budget itself (each said once). */
export function crossedLine(previousMinor: number, nextMinor: number, budgetMinor: number | null, alertPct: number): "alert" | "over" | null {
  if (budgetMinor === null || budgetMinor <= 0 || nextMinor <= previousMinor) return null;
  if (previousMinor <= budgetMinor && nextMinor > budgetMinor) return "over";
  const line = Math.round((budgetMinor * alertPct) / 100);
  return previousMinor < line && nextMinor >= line ? "alert" : null;
}

export type DepartmentNode = { id: string; parentId: string | null; memberIds: string[]; archived: boolean };

/** A department or team as listed, with where its budget stands this period. */
export type DepartmentView = DepartmentNode & {
  name: string;
  budgetMinor: number | null;
  period: GroupPeriod;
  alertPct: number;
  /** This period, its teams included. */
  spentMinor: number;
  from: string;
  to: string;
  state: BudgetState;
  remainingMinor: number | null;
  pct: number | null;
};

/** Spending per department with its teams' added in. */
export function rollUp(departments: readonly DepartmentNode[], ownSpend: ReadonlyMap<string, number>): Map<string, number> {
  const total = new Map<string, number>();
  for (const d of departments) total.set(d.id, ownSpend.get(d.id) ?? 0);
  for (const d of departments) {
    if (d.parentId && total.has(d.parentId)) total.set(d.parentId, total.get(d.parentId)! + (ownSpend.get(d.id) ?? 0));
  }
  return total;
}

/** The ids whose spending counts toward a department: itself and its teams. */
export function withTeams(departments: readonly DepartmentNode[], id: string): string[] {
  return [id, ...departments.filter((d) => d.parentId === id).map((d) => d.id)];
}

/**
 * Where someone's expenses go by default: the one open team they're in,
 * else the one open department; none when it's ambiguous or they're in none.
 */
export function defaultDepartmentFor(departments: readonly DepartmentNode[], userId: string): string | null {
  const mine = departments.filter((d) => !d.archived && d.memberIds.includes(userId));
  const teams = mine.filter((d) => d.parentId);
  if (teams.length === 1) return teams[0]!.id;
  if (teams.length > 1) return null;
  return mine.length === 1 ? mine[0]!.id : null;
}

/** What's wrong with placing a department under `parentId`, or null. */
export function parentProblem(departments: readonly DepartmentNode[], id: string | null, parentId: string | null): string | null {
  if (!parentId) return null;
  const parent = departments.find((d) => d.id === parentId);
  if (!parent) return "That department isn't in this workspace";
  if (parent.parentId) return "Teams go under a department, not under another team";
  if (id && parentId === id) return "A department can't be its own team";
  if (id && departments.some((d) => d.parentId === id)) return "This department has teams, so it can't become a team itself";
  return null;
}
