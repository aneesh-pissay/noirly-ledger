/**
 * Webhooks: a workspace's managers point Ledger at a URL, and each event
 * they pick is POSTed there, signed with the webhook's secret, by
 * @noirly-dev/webhooks (the same format Flow sends; see docs/API.md).
 */
export const WEBHOOK_EVENTS = [
  "transaction.created",
  "transaction.updated",
  "transaction.deleted",
  "expense.submitted",
  "expense.approved",
  "expense.rejected",
  "budget.alert",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABEL: Record<WebhookEventType, string> = {
  "transaction.created": "Transaction added",
  "transaction.updated": "Transaction changed",
  "transaction.deleted": "Transaction deleted",
  "expense.submitted": "Expense submitted for approval",
  "expense.approved": "Expense approved",
  "expense.rejected": "Expense rejected",
  "budget.alert": "Budget crossed its alert level",
};

/** Events only shared workspaces have. */
export const TEAM_ONLY_EVENTS: readonly WebhookEventType[] = ["expense.submitted", "expense.approved", "expense.rejected"];

export const MAX_WEBHOOKS = 10;
/** Deliveries given up on in a row before a webhook is turned off. */
export const DISABLE_AFTER_FAILURES = 15;

export function webhookEventsProblem(events: string[]): string | null {
  if (!events.length) return "Pick at least one event";
  if (events.some((e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e))) return "Unknown event";
  return null;
}

/** The approval events a decision makes: only the final word counts, not a first step passed on. */
export function decisionEvent(status: string): WebhookEventType | null {
  if (status === "approved") return "expense.approved";
  if (status === "rejected") return "expense.rejected";
  return null;
}

export type WebhookView = {
  id: string;
  workspaceId: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  disabledReason: string | null;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastStatus: "succeeded" | "failed" | null;
};

export type DeliveryView = {
  id: string;
  eventId: string;
  eventType: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  lastResponse: string | null;
  lastDurationMs: number | null;
  createdAt: string;
};
