import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ScheduledPayment, SubscriptionDismissal, Transaction as TransactionModel } from "@/src/server/models";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { spotSubscriptions, subscriptionKey, type Cadence, type SpottedSubscription } from "@/src/core/subscriptions";
import type { LedgerSyncProvider, RecurrenceRule } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** How far back to look: a little over a year, so yearly charges show twice. */
const LOOKBACK_DAYS = 400;

/** The recurring rule a spotted rhythm becomes. */
const RULES: Record<Cadence, RecurrenceRule> = {
  weekly: { frequency: "weekly", interval: 1 },
  monthly: { frequency: "monthly", interval: 1 },
  quarterly: { frequency: "monthly", interval: 3 },
  yearly: { frequency: "yearly", interval: 1 },
};

/**
 * Subscriptions in the workspace's spending that aren't tracked yet: from
 * expenses typed in or imported (not ones a recurring rule, an EMI or a bill
 * paid by hand already accounts for), leaving out what's already a
 * recurring rule and what someone said isn't a subscription.
 */
export async function spot(workspaceId: Types.ObjectId, today: string) {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - LOOKBACK_DAYS * 86_400_000);
  const [docs, rules, dismissed, paying] = await Promise.all([
    TransactionModel.find({
      workspaceId,
      deletedAt: null,
      isPosted: true,
      type: "expense",
      isRecurring: false,
      recurringParentId: null,
      installmentPlanId: null,
      date: { $gte: since, $lte: new Date(`${today}T23:59:59.999Z`) },
    })
      .select("date amountMinor currency merchant note")
      .lean<TransactionDocument[]>(),
    TransactionModel.find({ workspaceId, deletedAt: null, isRecurring: true, recurringParentId: null }).select("merchant note").lean<TransactionDocument[]>(),
    SubscriptionDismissal.find({ workspaceId }).select("key").lean(),
    ScheduledPayment.find({ workspaceId, transactionId: { $ne: null } }).select("transactionId").lean(),
  ]);
  const tracked = new Set(rules.map((r) => subscriptionKey({ merchant: r.merchant ?? null, note: r.note ?? null })).filter(Boolean));
  const skip = new Set(dismissed.map((d) => d.key));
  const paid = new Set(paying.map((p) => String(p.transactionId)));
  const records = docs
    .filter((d) => !paid.has(String(d._id)))
    .map((d) => ({ id: String(d._id), date: d.date.toISOString().slice(0, 10), amountMinor: d.amountMinor, currency: d.currency, merchant: d.merchant ?? null, note: d.note ?? null }));
  return spotSubscriptions(records, today).filter((s) => !tracked.has(s.key) && !skip.has(s.key));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Subscriptions spotted in the workspace's spending, still running ones first; with what they come to a month in each currency. */
export function listSpottedSubscriptions(userId: string, workspaceId: string): Promise<{ subscriptions: SpottedSubscription[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const found = await spot(oid(workspaceId), today());
    return { subscriptions: [...found.filter((s) => s.active), ...found.filter((s) => !s.active)] };
  });
}

/**
 * Tracks a spotted subscription as a recurring bill: its latest charge
 * becomes the rule, repeating on the rhythm found, so its next charges show
 * on the calendar and get reminders.
 */
export async function trackSubscription(sync: LedgerSyncProvider, userId: string, workspaceId: string, key: string) {
  const found = await withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    return (await spot(oid(workspaceId), today())).find((s) => s.key === key);
  });
  if (!found) throw new ApiError(404, "not_found", "That subscription isn't among the ones spotted");
  const latest = found.transactionIds.at(-1)!;
  await sync.updateTransaction(latest, { recurrence: RULES[found.cadence] });
  return { ruleId: latest };
}

/** Sets charges aside as not a subscription, so they aren't suggested again. */
export function dismissSubscription(userId: string, workspaceId: string, key: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    await SubscriptionDismissal.updateOne({ workspaceId: oid(workspaceId), key }, { $setOnInsert: { createdById: oid(userId) } }, { upsert: true });
  });
}
