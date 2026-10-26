import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Category, ReminderLog, ScheduledPayment, Transaction as TransactionModel, Workspace } from "@/src/server/models";
import type { ScheduledPaymentDocument } from "@/src/server/models/ScheduledPayment";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { notifyUsers } from "@/src/server/notifications/notify";
import { can } from "@/src/core/permissions/can";
import { dueOccurrences } from "@/src/core/recurrence/next";
import { formatMoney } from "@/src/core/locale-format";
import { addDays } from "@/src/core/projection";
import { datedReminders, OVERDUE_CATCH_UP_DAYS, overdueReminder, reminderKey, remindersFor, reminderText, type Reminder, type ReminderSettings } from "@/src/core/reminders";
import type { RecurrenceFrequency } from "@/src/core/models/enums";

/** How far ahead the run looks for charges: enough for the longest notice. */
const HORIZON_DAYS = 31;

export function settingsOf(doc: Pick<TransactionDocument, "reminders">): ReminderSettings | null {
  const r = doc.reminders;
  return r ? { daysBefore: r.daysBefore ?? null, trialEndsOn: r.trialEndsOn ?? null, cancelBy: r.cancelBy ?? null } : null;
}

/** Sends one reminder unless it already went (the log's unique key decides, so two runs at once can't both send). */
type Remindable = Pick<TransactionDocument, "workspaceId" | "createdById" | "amountMinor" | "currency">;

async function send(doc: Remindable, itemId: string, reminder: Reminder, name: string, today: string, links: Map<string, string>) {
  try {
    await ReminderLog.create({ key: reminderKey(itemId, reminder), workspaceId: doc.workspaceId });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
  const text = reminderText(reminder, name, formatMoney(doc.amountMinor, doc.currency), today);
  await notifyUsers({ userIds: [String(doc.createdById)], workspaceId: String(doc.workspaceId), kind: "bill.reminder", ...text, href: links.get(String(doc.workspaceId)) ?? "/recurring" });
  return true;
}

/**
 * Today's bill reminders, for every workspace: notice before recurring
 * charges (by each rule's settings), EMI installments and other expenses
 * entered ahead, bills paid by hand (and when one goes overdue), plus
 * trial-end and cancel-by dates. Each goes to whoever
 * set the bill up, once.
 */
export function runBillReminders(asOf = new Date()): Promise<{ reminders: number }> {
  return withDb(async () => {
    const today = asOf.toISOString().slice(0, 10);
    const horizon = addDays(today, HORIZON_DAYS);
    const end = new Date(`${horizon}T23:59:59.999Z`);

    const rules = await TransactionModel.find({ isRecurring: true, recurringParentId: null, deletedAt: null, recurrence: { $ne: null }, type: "expense" }).lean<TransactionDocument[]>();
    const latest = rules.length
      ? await TransactionModel.aggregate<{ _id: Types.ObjectId; date: Date }>([
          { $match: { recurringParentId: { $in: rules.map((r) => r._id) } } },
          { $group: { _id: "$recurringParentId", date: { $max: "$date" } } },
        ])
      : [];
    const lastPosted = new Map(latest.map((row) => [String(row._id), row.date]));
    const ahead = await TransactionModel.find({
      deletedAt: null,
      isPosted: true,
      type: "expense",
      isRecurring: false,
      recurringParentId: null,
      date: { $gte: new Date(`${today}T00:00:00.000Z`), $lte: end },
    }).lean<TransactionDocument[]>();

    // Names fall back to the category; links go to the workspace's own pages.
    const all = [...rules, ...ahead];
    const categoryIds = [...new Set(all.map((t) => t.categoryId).filter(Boolean).map(String))];
    const categories = new Map((await Category.find({ _id: { $in: categoryIds.map((id) => new Types.ObjectId(id)) } }).select("name").lean()).map((c) => [String(c._id), c.name]));
    const payments = await ScheduledPayment.find({
      paidOn: null,
      dueDate: { $gte: addDays(today, -OVERDUE_CATCH_UP_DAYS), $lte: horizon },
    }).lean<ScheduledPaymentDocument[]>();
    const workspaceIds = [...new Set([...all, ...payments].map((t) => String(t.workspaceId)))];
    const workspaces = await Workspace.find({ _id: { $in: workspaceIds.map((id) => new Types.ObjectId(id)) } }).select("kind").lean();
    const links = new Map(workspaces.map((w) => [String(w._id), w.kind === "personal" ? "/recurring" : `/w/${w._id}/transactions`]));
    const nameOf = (t: TransactionDocument) => t.merchant ?? t.note ?? (t.categoryId ? categories.get(String(t.categoryId)) : undefined) ?? "A bill";

    let sent = 0;
    for (const rule of rules) {
      const recurrence = rule.recurrence!;
      const settings = settingsOf(rule);
      const charges = dueOccurrences(
        lastPosted.get(String(rule._id)) ?? rule.date,
        {
          frequency: recurrence.frequency as RecurrenceFrequency,
          interval: recurrence.interval,
          byMonthDay: recurrence.byMonthDay ?? (recurrence.frequency === "monthly" ? rule.date.getUTCDate() : undefined),
          until: recurrence.until,
        },
        end,
        400,
      ).map((d) => d.toISOString().slice(0, 10));
      // A rule dated ahead is its own first charge.
      const first = rule.date.toISOString().slice(0, 10);
      if (!lastPosted.has(String(rule._id)) && first >= today) charges.unshift(first);
      const reminders = [
        ...charges.filter((d) => d >= today).flatMap((date) => remindersFor({ date, frequency: recurrence.frequency, interval: recurrence.interval }, settings, today)),
        ...datedReminders(settings, today),
      ];
      for (const reminder of reminders) if (await send(rule, String(rule._id), reminder, nameOf(rule), today, links)) sent++;
    }
    // Bills paid by hand: notice before the due date, and one note when it's overdue.
    for (const payment of payments) {
      const overdue = overdueReminder(payment.dueDate, today);
      const reminders = [...remindersFor({ date: payment.dueDate, frequency: null }, null, today), ...(overdue ? [overdue] : [])];
      for (const reminder of reminders) if (await send(payment, String(payment._id), reminder, payment.name, today, links)) sent++;
    }
    for (const doc of ahead) {
      for (const reminder of remindersFor({ date: doc.date.toISOString().slice(0, 10), frequency: null }, null, today)) {
        if (await send(doc, String(doc._id), reminder, nameOf(doc), today, links)) sent++;
      }
    }
    return { reminders: sent };
  });
}

/** Sets a recurring rule's reminders; null settings go back to the default notice. */
export function setReminders(userId: string, ruleId: string, settings: ReminderSettings | null) {
  return withDb(async () => {
    if (!Types.ObjectId.isValid(ruleId)) throw new ApiError(400, "invalid_request", "Invalid id");
    const rule = await TransactionModel.findOne({ _id: new Types.ObjectId(ruleId), deletedAt: null });
    if (!rule) throw new ApiError(404, "not_found", "Transaction not found");
    const role = await requireMembershipRole(userId, String(rule.workspaceId));
    if (String(rule.createdById) !== userId && !can(role, "workspace.manage")) throw new ApiError(403, "forbidden", "You can only set reminders on bills you added");
    if (!rule.isRecurring || rule.recurringParentId || !rule.recurrence) throw new ApiError(400, "invalid_request", "Reminders are set on a recurring rule");
    rule.set("reminders", settings);
    await rule.save();
    return settingsOf(rule);
  });
}
