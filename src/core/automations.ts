import type { ExportFrequency } from "@/src/core/export-schedules";

/**
 * Automations that run on a schedule (dates as in src/core/export-schedules.ts):
 *
 * - Digest: every week or month, a summary of the period just finished
 *   (income, spending, what's left, the biggest categories, budgets gone
 *   over, unusual spending) as a notification, and by email if wanted.
 * - Budget refresh: every month, set monthly budgets to what was actually
 *   spent: the average of the last few months, plus or minus a percent.
 * - Sweep: every month, put a share of last month's unspent budget money
 *   into a savings goal.
 */
export const AUTOMATION_KINDS = ["digest", "budget_refresh", "sweep"] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];

export const AUTOMATION_LABEL: Record<AutomationKind, string> = {
  digest: "Spending digest",
  budget_refresh: "Budget refresh",
  sweep: "Sweep unspent budget into a goal",
};

/** Budget refresh and sweep work in months; a digest can be weekly too. */
export function allowedFrequencies(kind: AutomationKind): ExportFrequency[] {
  return kind === "digest" ? ["weekly", "monthly"] : ["monthly"];
}

export type AutomationParams = {
  /** Digest: who gets it, and whether by email too. */
  recipientIds: string[];
  email: boolean;
  /** Budget refresh: how many months to average, and the change on it (−50 to 100). */
  months: number;
  adjustPct: number;
  /** Budget refresh: which budgets' categories (empty: every monthly budget). */
  categoryIds: string[];
  /** Sweep: the goal, and how much of what's unspent (1–100). */
  goalId: string | null;
  sweepPct: number;
};

export type AutomationBody = { name: string; kind: AutomationKind; frequency: ExportFrequency; runDay: number; params: AutomationParams };

export type AutomationView = AutomationBody & {
  id: string;
  schedule: string;
  nextRunOn: string;
  paused: boolean;
  lastRunAt: string | null;
  lastResult: string | null;
  lastOk: boolean | null;
};

export const DEFAULT_PARAMS: AutomationParams = { recipientIds: [], email: false, months: 3, adjustPct: 0, categoryIds: [], goalId: null, sweepPct: 100 };

export function automationProblem(kind: AutomationKind, frequency: ExportFrequency, p: AutomationParams): string | null {
  if (!allowedFrequencies(kind).includes(frequency)) return "That runs monthly";
  if (kind === "digest" && !p.recipientIds.length) return "Pick who gets the digest";
  if (kind === "budget_refresh") {
    if (!Number.isInteger(p.months) || p.months < 1 || p.months > 12) return "Average over 1 to 12 months";
    if (!Number.isFinite(p.adjustPct) || p.adjustPct < -50 || p.adjustPct > 100) return "Adjust by −50% to +100%";
  }
  if (kind === "sweep") {
    if (!p.goalId) return "Pick the goal to sweep into";
    if (!Number.isFinite(p.sweepPct) || p.sweepPct < 1 || p.sweepPct > 100) return "Sweep 1% to 100%";
  }
  return null;
}

/**
 * A budget's new limit from what was spent in each of the last months:
 * their average, adjusted by a percent, rounded up to a whole unit. Null
 * when nothing was spent (the budget is left as it is).
 */
export function refreshedLimit(spentPerMonth: readonly number[], adjustPct: number): number | null {
  if (!spentPerMonth.length || spentPerMonth.every((s) => s <= 0)) return null;
  const average = spentPerMonth.reduce((s, v) => s + Math.max(0, v), 0) / spentPerMonth.length;
  return Math.ceil((average * (1 + adjustPct / 100)) / 100) * 100;
}

/** What's swept: the given share of every budget's unspent money (overspent ones count as nothing). */
export function sweepAmount(budgets: ReadonlyArray<{ limitMinor: number; spentMinor: number }>, pct: number): number {
  const unspent = budgets.reduce((s, b) => s + Math.max(0, b.limitMinor - b.spentMinor), 0);
  return Math.floor((unspent * pct) / 100);
}

export type DigestFacts = {
  from: string;
  to: string;
  incomeMinor: number;
  expenseMinor: number;
  savingsRatePct: number | null;
  /** Compared with the same number of days before; null with nothing then. */
  changePct: number | null;
  topCategories: Array<{ name: string; amountMinor: number }>;
  overBudgets: Array<{ name: string; overMinor: number }>;
  unusual: Array<{ title: string; amountMinor: number }>;
};

/** The digest in words. */
export function digestText(f: DigestFacts, money: (minor: number) => string): { title: string; body: string } {
  const lines = [
    `Income ${money(f.incomeMinor)}, spending ${money(f.expenseMinor)}${f.changePct === null ? "" : ` (${f.changePct > 0 ? "+" : ""}${f.changePct}% on before)`}, ${f.incomeMinor - f.expenseMinor >= 0 ? "kept" : "short"} ${money(Math.abs(f.incomeMinor - f.expenseMinor))}${f.savingsRatePct === null ? "" : ` (${f.savingsRatePct}% of income)`}.`,
  ];
  if (f.topCategories.length) lines.push(`Most went on ${f.topCategories.map((c) => `${c.name} ${money(c.amountMinor)}`).join(", ")}.`);
  if (f.overBudgets.length) lines.push(`Over budget: ${f.overBudgets.map((b) => `${b.name} by ${money(b.overMinor)}`).join(", ")}.`);
  if (f.unusual.length) lines.push(`Unusual: ${f.unusual.map((u) => `${u.title} ${money(u.amountMinor)}`).join(", ")}.`);
  return { title: `Your digest, ${f.from} to ${f.to}`, body: lines.join(" ") };
}
