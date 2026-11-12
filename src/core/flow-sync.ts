import type { BillItem, BillMarker } from "@/src/core/bills";

/**
 * Bills and reminders as Noirly Flow tasks. Each person links a workspace
 * to a Flow workspace (and project, or the Inbox) with a Flow access token;
 * the daily run then keeps one task per bill due in the next few days, and
 * one per free trial ending or cancel-by date. A bill paid in Ledger
 * completes its task; one removed cancels it. Ledger never touches a task
 * again once it's done or canceled, and changes made in Flow stay.
 */

export const FLOW_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type FlowPriority = (typeof FLOW_PRIORITIES)[number];

export type FlowLinkSettings = {
  /** Bills to pay: recurring, by hand, EMIs, card bills, expenses entered ahead. */
  bills: boolean;
  /** Free trials ending and dates to cancel by. */
  reminders: boolean;
  /** How far ahead tasks are made. */
  daysAhead: number;
  priority: FlowPriority;
};

/** A link as its owner sees it: never the token, only its last four. */
export type FlowLinkView = FlowLinkSettings & {
  tokenHint: string;
  flowWorkspaceId: string;
  flowWorkspaceName: string;
  flowProjectId: string | null;
  flowProjectName: string | null;
  paused: boolean;
  lastSyncAt: string | null;
  lastResult: string | null;
  lastOk: boolean | null;
  openTasks: number;
};

export const DEFAULT_FLOW_SETTINGS: FlowLinkSettings = { bills: true, reminders: true, daysAhead: 7, priority: "medium" };
export const MAX_FLOW_DAYS = 31;

export function flowSettingsProblem(s: FlowLinkSettings): string | null {
  if (!s.bills && !s.reminders) return "Pick bills, reminders or both";
  if (!Number.isInteger(s.daysAhead) || s.daysAhead < 1 || s.daysAhead > MAX_FLOW_DAYS) return `Make tasks 1 to ${MAX_FLOW_DAYS} days ahead`;
  if (!FLOW_PRIORITIES.includes(s.priority)) return "Pick a priority";
  return null;
}

/** A task as Ledger wants it in Flow. */
/** A task as Ledger wants it in Flow; `onlyAhead` ones aren't made once their day has passed. */
export type DesiredTask = { key: string; title: string; description: string; dueDate: string; done: boolean; onlyAhead?: boolean };

/** A task Ledger made, as it last left it. */
export type TrackedTask = { key: string; flowTaskId: string; dueDate: string; state: "open" | "done" | "canceled" };

/**
 * What identifies a bill across runs: a recurring charge by its rule and
 * day (its id changes once it's recorded), anything else by its own id.
 */
export function billKey(item: Pick<BillItem, "source" | "ruleId" | "date" | "id">) {
  return item.source === "recurring" && item.ruleId ? `rule:${item.ruleId}:${item.date}` : `${item.source}:${item.id}`;
}

export function billTask(item: BillItem, money: (minor: number, currency: string) => string, workspaceName: string): DesiredTask {
  const name = item.merchant ?? item.note ?? "A bill";
  return {
    key: billKey(item),
    title: `Pay ${name}: ${money(item.amountMinor, item.currency)}`,
    description: [`Due ${item.date}, from Noirly Ledger (${workspaceName}).`, item.note && item.note !== name ? item.note : null, item.source === "recurring" ? "Recorded on its own on the day; check it went through." : null].filter(Boolean).join("\n"),
    dueDate: item.date,
    done: item.status === "paid",
  };
}

export function markerTask(marker: BillMarker, workspaceName: string): DesiredTask {
  const name = marker.name ?? "a subscription";
  return {
    key: `${marker.kind}:${marker.ruleId}:${marker.date}`,
    title: marker.kind === "trial" ? `Free trial of ${name} ends` : `Cancel ${name}`,
    description: `${marker.kind === "trial" ? "Decide whether to keep it before it turns into a charge" : "The date you meant to cancel by"}: ${marker.date}. From Noirly Ledger (${workspaceName}).`,
    dueDate: marker.date,
    done: false,
    // A trial that ended last week is no longer something to decide.
    onlyAhead: true,
  };
}

export type SyncPlan = {
  create: DesiredTask[];
  complete: TrackedTask[];
  cancel: TrackedTask[];
  move: Array<{ task: TrackedTask; dueDate: string }>;
};

/**
 * What to do in Flow: make tasks for what's open and due by `through` (one
 * gone overdue too, as it's still to pay), complete the ones now paid, move
 * the ones whose date changed, and cancel the ones no longer there. Only
 * tasks dated from `scannedFrom` on can be missing for real; older ones
 * weren't looked for.
 */
export function planSync(desired: DesiredTask[], tracked: TrackedTask[], window: { scannedFrom: string; today: string; through: string }): SyncPlan {
  const { scannedFrom, today, through } = window;
  const wanted = new Map(desired.map((d) => [d.key, d]));
  const known = new Map(tracked.map((t) => [t.key, t]));
  const plan: SyncPlan = { create: [], complete: [], cancel: [], move: [] };
  for (const d of wanted.values()) {
    if (!known.has(d.key) && !d.done && d.dueDate <= through && !(d.onlyAhead && d.dueDate < today)) plan.create.push(d);
  }
  for (const t of known.values()) {
    if (t.state !== "open") continue;
    const d = wanted.get(t.key);
    if (!d) {
      if (t.dueDate >= scannedFrom) plan.cancel.push(t);
    } else if (d.done) plan.complete.push(t);
    else if (d.dueDate !== t.dueDate) plan.move.push({ task: t, dueDate: d.dueDate });
  }
  plan.create.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
  return plan;
}

/** Flow stores an all-day date at noon. */
export function flowDueAt(date: string) {
  return `${date}T12:00:00.000Z`;
}
