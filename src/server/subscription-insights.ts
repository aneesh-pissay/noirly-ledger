import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ReminderLog, SubscriptionDismissal, Transaction as TransactionModel, WorkspaceMember } from "@/src/server/models";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { notifyUsers } from "@/src/server/notifications/notify";
import { spot } from "@/src/server/subscriptions";
import { settingsOf } from "@/src/server/reminders";
import { can } from "@/src/core/permissions/can";
import { formatMoney } from "@/src/core/locale-format";
import { nextOccurrence } from "@/src/core/recurrence/next";
import { subscriptionKey, type Cadence } from "@/src/core/subscriptions";
import { priceRise, subscriptionInsights, type SubscriptionInsight, type SubscriptionSeries } from "@/src/core/subscription-insights";
import type { RecurrenceFrequency } from "@/src/core/models/enums";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const PER_MONTH: Record<Cadence, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

/** The rhythm a recurring rule keeps, as subscriptions count it; daily rules aren't subscriptions. */
function cadenceOf(frequency: string, interval: number): Cadence | null {
  if (frequency === "weekly") return "weekly";
  if (frequency === "yearly") return "yearly";
  if (frequency === "monthly") return interval >= 3 ? "quarterly" : "monthly";
  return null;
}

/**
 * Every subscription in a workspace with what it has charged: tracked ones
 * (recurring expense rules and the charges they posted), and ones spotted
 * in spending that are still running.
 */
async function seriesOf(workspaceId: Types.ObjectId, asOf: string): Promise<SubscriptionSeries[]> {
  const rules = await TransactionModel.find({ workspaceId, deletedAt: null, isRecurring: true, recurringParentId: null, recurrence: { $ne: null }, type: "expense" }).lean<TransactionDocument[]>();
  const posted = rules.length
    ? await TransactionModel.find({ recurringParentId: { $in: rules.map((r) => r._id) }, deletedAt: null }).select("recurringParentId date amountMinor").lean<TransactionDocument[]>()
    : [];
  const end = `${asOf}T23:59:59.999Z`;
  const tracked = rules.flatMap((rule): SubscriptionSeries[] => {
    const recurrence = rule.recurrence!;
    const cadence = cadenceOf(recurrence.frequency, recurrence.interval);
    const key = subscriptionKey({ merchant: rule.merchant ?? null, note: rule.note ?? null });
    if (!cadence || !key) return [];
    const charges = [rule, ...posted.filter((p) => String(p.recurringParentId) === String(rule._id))]
      .filter((t) => t.date.toISOString() <= end)
      .map((t) => ({ date: t.date.toISOString().slice(0, 10), amountMinor: t.amountMinor }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    // The next charge on its rhythm from the latest one (or the rule's own date, when that's ahead).
    let next = new Date(`${charges.at(-1)?.date ?? rule.date.toISOString().slice(0, 10)}T12:00:00Z`);
    const rhythm = { frequency: recurrence.frequency as RecurrenceFrequency, interval: recurrence.interval, byMonthDay: recurrence.frequency === "monthly" ? rule.date.getUTCDate() : undefined };
    while (next.toISOString().slice(0, 10) < asOf || (charges.length && next.toISOString().slice(0, 10) === charges.at(-1)!.date)) next = nextOccurrence(next, rhythm);
    const until = recurrence.until ? recurrence.until.toISOString().slice(0, 10) : null;
    const nextDate = until && next.toISOString().slice(0, 10) > until ? null : next.toISOString().slice(0, 10);
    return [{
      key,
      name: rule.merchant ?? rule.note ?? "Subscription",
      currency: rule.currency,
      cadence,
      charges,
      monthlyMinor: Math.round(rule.amountMinor * PER_MONTH[cadence]),
      nextDate,
      ruleId: String(rule._id),
      reviewedOn: rule.reviewedOn ?? null,
    }];
  });
  const spotted = (await spot(workspaceId, asOf))
    .filter((s) => s.active)
    .map((s): SubscriptionSeries => ({ key: s.key, name: s.name, currency: s.currency, cadence: s.cadence, charges: s.charges, monthlyMinor: s.monthlyMinor, nextDate: s.nextDate, ruleId: null, reviewedOn: null }));
  return [...tracked, ...spotted];
}

/** Insights someone set aside are kept as dismissals keyed "insight:<id>", beside the subscription ones. */
const dismissalKey = (id: string) => `insight:${id}`;

/** What's worth knowing about the workspace's subscriptions, leaving out what someone set aside. */
export function listSubscriptionInsights(userId: string, workspaceId: string): Promise<{ insights: SubscriptionInsight[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const [all, dismissed] = await Promise.all([seriesOf(ws, today()), SubscriptionDismissal.find({ workspaceId: ws, key: /^insight:/ }).select("key").lean()]);
    const skip = new Set(dismissed.map((d) => d.key));
    const insights = subscriptionInsights(all, today()).filter((i) => !skip.has(dismissalKey(i.id)));
    // A review offers to set a cancel-by reminder, keeping the bill's other reminder settings.
    const ruleIds = insights.flatMap((i) => (i.kind === "review" ? [oid(i.ruleId)] : []));
    const rules = new Map((await TransactionModel.find({ _id: { $in: ruleIds } }).select("reminders").lean<TransactionDocument[]>()).map((r) => [String(r._id), settingsOf(r)]));
    return { insights: insights.map((i) => (i.kind === "review" ? { ...i, reminders: rules.get(i.ruleId) ?? null } : i)) };
  });
}

export function dismissInsight(userId: string, workspaceId: string, id: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    await SubscriptionDismissal.updateOne({ workspaceId: oid(workspaceId), key: dismissalKey(id) }, { $setOnInsert: { createdById: oid(userId) } }, { upsert: true });
  });
}

/** Notes that a tracked subscription is still in use, so it isn't asked about for half a year. */
export function markStillUsed(userId: string, ruleId: string) {
  return withDb(async () => {
    const rule = await TransactionModel.findOne({ _id: oid(ruleId), deletedAt: null, isRecurring: true, recurringParentId: null });
    if (!rule) throw new ApiError(404, "not_found", "Recurring bill not found");
    const role = await requireMembershipRole(userId, String(rule.workspaceId));
    if (String(rule.createdById) !== userId && !can(role, "workspace.manage")) throw new ApiError(403, "forbidden", "You can only check on bills you added");
    rule.reviewedOn = today();
    await rule.save();
    return { reviewedOn: rule.reviewedOn };
  });
}

/** How long after a dearer charge its alert can still go, so a missed run catches up. */
const PRICE_ALERT_DAYS = 7;

/**
 * Tells a workspace's members when a subscription charged more than the time
 * before, once per charge, for charges in the last week.
 */
export function runPriceAlerts(asOf = new Date()): Promise<{ priceAlerts: number }> {
  return withDb(async () => {
    const day = asOf.toISOString().slice(0, 10);
    const since = new Date(asOf.getTime() - PRICE_ALERT_DAYS * 86_400_000);
    const workspaceIds = (await TransactionModel.distinct("workspaceId", { deletedAt: null, type: "expense", date: { $gte: since, $lte: asOf } })) as Types.ObjectId[];
    let sent = 0;
    for (const workspaceId of workspaceIds) {
      const rises = (await seriesOf(workspaceId, day)).map(priceRise).filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.on >= since.toISOString().slice(0, 10));
      if (!rises.length) continue;
      const members = (await WorkspaceMember.find({ workspaceId }).select("userId").lean()).map((m) => String(m.userId));
      for (const rise of rises) {
        try {
          await ReminderLog.create({ key: rise.id, workspaceId });
        } catch (error) {
          if ((error as { code?: number }).code === 11000) continue;
          throw error;
        }
        await notifyUsers({
          userIds: members,
          workspaceId: String(workspaceId),
          kind: "subscription.price",
          title: `${rise.name} went up ${rise.percent}%`,
          body: `It charged ${formatMoney(rise.toMinor, rise.currency)} on ${rise.on}, up from ${formatMoney(rise.fromMinor, rise.currency)}.`,
          href: "/recurring",
        });
        sent++;
      }
    }
    return { priceAlerts: sent };
  });
}
