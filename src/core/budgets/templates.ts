import type { BudgetPeriod } from "@/src/core/models/enums";
import type { RolloverMode } from "@/src/core/budgets/rollover";

/**
 * A budget template: a set of budgets to create in one go. A line names its
 * category (matched by name, created if missing) and either a fixed limit or
 * a share of monthly income, which is given when the template is applied.
 */
export type TemplateLine = {
  categoryName: string;
  period: BudgetPeriod;
  limitMinor?: number;
  /** Percent of the monthly income given when applying. */
  sharePct?: number;
  rollover?: RolloverMode;
};

export type BudgetTemplateDef = { id: string; name: string; description: string; lines: TemplateLine[] };

/** Templates every workspace has; their categories are the ones new workspaces start with. */
export const BUILT_IN_TEMPLATES: BudgetTemplateDef[] = [
  {
    id: "builtin:50-30-20",
    name: "50/30/20",
    description: "Half of income to needs, 30% to wants; the 20% left over is for savings and goals.",
    lines: [
      { categoryName: "Housing", period: "monthly", sharePct: 25 },
      { categoryName: "Utilities", period: "monthly", sharePct: 5 },
      { categoryName: "Food & Drink", period: "monthly", sharePct: 12 },
      { categoryName: "Transport", period: "monthly", sharePct: 5 },
      { categoryName: "Health", period: "monthly", sharePct: 3 },
      { categoryName: "Entertainment", period: "monthly", sharePct: 10 },
      { categoryName: "Shopping", period: "monthly", sharePct: 10 },
      { categoryName: "Travel", period: "monthly", sharePct: 10, rollover: "unspent" },
    ],
  },
  {
    id: "builtin:essentials",
    name: "Essentials first",
    description: "Budgets for the bills and basics only, 75% of income; the rest is unplanned.",
    lines: [
      { categoryName: "Housing", period: "monthly", sharePct: 35 },
      { categoryName: "Utilities", period: "monthly", sharePct: 8 },
      { categoryName: "Food & Drink", period: "monthly", sharePct: 15 },
      { categoryName: "Transport", period: "monthly", sharePct: 10 },
      { categoryName: "Health", period: "monthly", sharePct: 7, rollover: "unspent" },
    ],
  },
];

export function needsIncome(lines: TemplateLine[]) {
  return lines.some((line) => line.sharePct != null);
}

/** Each line's limit: its fixed amount, or its share of the monthly income (rounded to whole units of the currency). */
export function templateLimits(lines: TemplateLine[], monthlyIncomeMinor: number | null): number[] {
  return lines.map((line) => {
    if (line.sharePct == null) return line.limitMinor ?? 0;
    if (monthlyIncomeMinor == null) throw new Error("This template is a share of income; enter your monthly income");
    return Math.round((monthlyIncomeMinor * line.sharePct) / 100 / 100) * 100;
  });
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * A custom budget that renews moves on to the next stretch of the same length
 * once its dates have passed, as many times as needed to reach today. Dates
 * are YYYY-MM-DD; null when it hasn't ended yet.
 */
export function renewedRange(start: string, end: string, today: string): { start: string; end: string } | null {
  if (end >= today) return null;
  const from = Date.parse(`${start}T00:00:00.000Z`);
  const to = Date.parse(`${end}T00:00:00.000Z`);
  const length = Math.round((to - from) / DAY) + 1;
  const now = Date.parse(`${today}T00:00:00.000Z`);
  const steps = Math.ceil((now - to) / (length * DAY));
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { start: day(from + steps * length * DAY), end: day(to + steps * length * DAY) };
}
