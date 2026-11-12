import type { NotificationKind } from "@/src/core/sync/types";
import { DEFAULT_REMINDER_DAYS, MAX_REMINDER_DAYS } from "@/src/core/reminders";

/**
 * How each person hears about things, set per workspace: by topic, in the
 * app and by email (or not at all), plus their own thresholds: the budget
 * levels to be told at, how many days before a bill, and how big an expense
 * has to be to hear about it.
 */
export const NOTIFICATION_TOPICS = ["budgets", "bills", "large", "approvals", "goals", "subscriptions", "automations"] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export const TOPIC_LABEL: Record<NotificationTopic, string> = {
  budgets: "Budget alerts",
  bills: "Bills: reminders and emailed bills and receipts",
  large: "Large expenses",
  approvals: "Approvals",
  goals: "Goals and contributions",
  subscriptions: "Subscription price changes",
  automations: "Workflows, automations and reports",
};

const TOPIC_OF: Record<NotificationKind, NotificationTopic> = {
  "budget.threshold": "budgets",
  "bill.reminder": "bills",
  "recurring.due": "bills",
  "transaction.large": "large",
  "email.received": "bills",
  "approval.requested": "approvals",
  "approval.decided": "approvals",
  "goal.reached": "goals",
  "goal.milestone": "goals",
  "goal.contribution": "goals",
  "pool.contribution": "goals",
  "subscription.price": "subscriptions",
  "report.failed": "automations",
  workflow: "automations",
};

export function topicOf(kind: NotificationKind): NotificationTopic {
  return TOPIC_OF[kind];
}

export type Channels = { inApp: boolean; email: boolean };

export type NotificationPrefs = {
  channels: Record<NotificationTopic, Channels>;
  /** Percents of a budget to be told at, lowest first; empty uses each budget's own alert level. */
  budgetLevels: number[];
  /** Notice before a bill (0: on the day), unless the bill sets its own. */
  billDaysBefore: number;
  /** Tell me about any single expense at least this big (base currency, minor units); null: don't. */
  largeExpenseMinor: number | null;
};

export const MAX_BUDGET_LEVELS = 5;

export function defaultPrefs(): NotificationPrefs {
  return {
    channels: Object.fromEntries(NOTIFICATION_TOPICS.map((t) => [t, { inApp: true, email: true }])) as Record<NotificationTopic, Channels>,
    budgetLevels: [],
    billDaysBefore: DEFAULT_REMINDER_DAYS,
    largeExpenseMinor: null,
  };
}

/** Stored preferences over the defaults, so topics added later start on. */
export function withDefaults(stored: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  const base = defaultPrefs();
  if (!stored) return base;
  const channels = { ...base.channels };
  for (const topic of NOTIFICATION_TOPICS) {
    const c = stored.channels?.[topic];
    if (c) channels[topic] = { inApp: c.inApp !== false, email: c.email !== false };
  }
  return {
    channels,
    budgetLevels: stored.budgetLevels ? [...new Set(stored.budgetLevels)].sort((a, b) => a - b) : base.budgetLevels,
    billDaysBefore: stored.billDaysBefore ?? base.billDaysBefore,
    largeExpenseMinor: stored.largeExpenseMinor ?? null,
  };
}

export function prefsProblem(p: NotificationPrefs): string | null {
  if (p.budgetLevels.length > MAX_BUDGET_LEVELS) return `Up to ${MAX_BUDGET_LEVELS} budget levels`;
  if (p.budgetLevels.some((l) => !Number.isInteger(l) || l < 1 || l > 200)) return "Budget levels are whole percents from 1 to 200";
  if (!Number.isInteger(p.billDaysBefore) || p.billDaysBefore < 0 || p.billDaysBefore > MAX_REMINDER_DAYS) return `Remind 0 to ${MAX_REMINDER_DAYS} days before a bill`;
  if (p.largeExpenseMinor !== null && (!Number.isInteger(p.largeExpenseMinor) || p.largeExpenseMinor <= 0)) return "Enter an amount above zero";
  return null;
}

/**
 * The highest level a new expense took a budget across, or null: crossing
 * 50 and 80 at once tells you once, at 80.
 */
export function crossedLevel(levels: readonly number[], previousSpentMinor: number, nextSpentMinor: number, availableMinor: number): number | null {
  if (availableMinor <= 0) return null;
  let crossed: number | null = null;
  for (const level of levels) {
    const line = Math.round((availableMinor * level) / 100);
    if (previousSpentMinor < line && nextSpentMinor >= line) crossed = Math.max(crossed ?? 0, level);
  }
  return crossed;
}

/** Whether an expense is big enough to tell someone about. */
export function isLargeExpense(prefs: Pick<NotificationPrefs, "largeExpenseMinor">, baseAmountMinor: number) {
  return prefs.largeExpenseMinor !== null && baseAmountMinor >= prefs.largeExpenseMinor;
}
