import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ScheduledPayment, Transaction as TransactionModel } from "@/src/server/models";
import type { ScheduledPaymentDocument } from "@/src/server/models/ScheduledPayment";
import { paymentStatus } from "@/src/core/payments";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { upcomingRecurring } from "@/src/server/projection";
import { billStatus, billTotals, isMonth, monthBounds, type BillItem, type BillMarker } from "@/src/core/bills";
import { settingsOf } from "@/src/server/reminders";

/**
 * A month of bills: recurring expenses (the ones recorded, and the ones
 * still to come), EMI installments, other expenses entered ahead of their
 * date, and bills paid by hand. Transfers and income aren't bills.
 */
export function getBillCalendar(userId: string, workspaceId: string, month: string) {
  return withDb(async () => {
    if (!isMonth(month)) throw new ApiError(400, "invalid_request", "month is YYYY-MM");
    await requireMembershipRole(userId, workspaceId);
    const ws = new Types.ObjectId(workspaceId);
    const { first, last } = monthBounds(month);
    const today = new Date().toISOString().slice(0, 10);

    const recorded = await TransactionModel.find({
      workspaceId: ws,
      deletedAt: null,
      isPosted: true,
      type: "expense",
      date: { $gte: new Date(`${first}T00:00:00.000Z`), $lte: new Date(`${last}T23:59:59.999Z`) },
      $or: [
        { recurringParentId: { $ne: null } },
        { isRecurring: true, recurringParentId: null },
        { installmentPlanId: { $ne: null } },
        { date: { $gt: new Date(`${today}T23:59:59.999Z`) } },
      ],
    }).lean<TransactionDocument[]>();
    const coming = (await upcomingRecurring(ws, last)).filter((o) => o.type === "expense" && o.date >= first && o.date <= last);
    // Occurrences take their name, how often they repeat and their reminders from their rule.
    const rules = new Map(
      (
        await TransactionModel.find({ workspaceId: ws, isRecurring: true, recurringParentId: null, deletedAt: null, type: "expense" })
          .select("merchant note recurrence reminders")
          .lean<TransactionDocument[]>()
      ).map((r) => [String(r._id), r]),
    );

    // Bills paid by hand; an expense that paid one shows as that payment, not twice.
    const payments = await ScheduledPayment.find({ workspaceId: ws, dueDate: { $gte: first, $lte: last } }).lean<ScheduledPaymentDocument[]>();
    const paying = new Set((await ScheduledPayment.find({ workspaceId: ws, transactionId: { $ne: null } }).select("transactionId").lean()).map((p) => String(p.transactionId)));

    const items: BillItem[] = recorded.filter((t) => !paying.has(String(t._id))).map((t) => {
      const ruleId = t.recurringParentId ? String(t.recurringParentId) : t.isRecurring ? String(t._id) : null;
      const rule = ruleId ? (rules.get(ruleId) ?? t) : null;
      const date = t.date.toISOString().slice(0, 10);
      return {
        id: String(t._id),
        date,
        merchant: t.merchant ?? rule?.merchant ?? null,
        note: t.note ?? rule?.note ?? null,
        amountMinor: t.amountMinor,
        currency: t.currency,
        categoryId: t.categoryId ? String(t.categoryId) : null,
        accountId: t.accountId ? String(t.accountId) : null,
        source: t.installmentPlanId ? "emi" : ruleId ? "recurring" : "scheduled",
        status: billStatus(date, today, true),
        transactionId: String(t._id),
        ruleId,
        frequency: rule?.recurrence?.frequency ?? null,
        ...(rule ? { reminders: settingsOf(rule) } : {}),
      };
    });
    for (const o of coming) {
      items.push({
        id: `${o.ruleId}:${o.date}`,
        date: o.date,
        merchant: o.merchant ?? null,
        note: o.note ?? null,
        amountMinor: o.amountMinor,
        currency: o.currency,
        categoryId: o.categoryId,
        accountId: o.accountId,
        source: "recurring",
        status: billStatus(o.date, today, false),
        transactionId: null,
        ruleId: o.ruleId ?? null,
        frequency: o.frequency ?? null,
        reminders: o.ruleId && rules.has(o.ruleId) ? settingsOf(rules.get(o.ruleId)!) : null,
      });
    }
    for (const payment of payments) {
      const status = paymentStatus(payment.dueDate, today, Boolean(payment.paidOn));
      items.push({
        id: String(payment._id),
        date: payment.dueDate,
        merchant: payment.name,
        note: payment.note ?? null,
        amountMinor: payment.paidAmountMinor ?? payment.amountMinor,
        currency: payment.currency,
        categoryId: payment.categoryId ? String(payment.categoryId) : null,
        accountId: payment.accountId ? String(payment.accountId) : null,
        source: "payment",
        status: status === "paid" ? "paid" : status === "overdue" ? "overdue" : payment.dueDate === today ? "due" : "upcoming",
        transactionId: payment.transactionId ? String(payment.transactionId) : null,
        ruleId: null,
        frequency: payment.repeat && payment.repeat !== "none" ? payment.repeat : null,
      });
    }
    const markers: BillMarker[] = [...rules.values()].flatMap((rule) => {
      const settings = settingsOf(rule);
      const name = rule.merchant ?? rule.note ?? null;
      return [
        ...(settings?.trialEndsOn && settings.trialEndsOn >= first && settings.trialEndsOn <= last ? [{ date: settings.trialEndsOn, kind: "trial" as const, ruleId: String(rule._id), name }] : []),
        ...(settings?.cancelBy && settings.cancelBy >= first && settings.cancelBy <= last ? [{ date: settings.cancelBy, kind: "cancel" as const, ruleId: String(rule._id), name }] : []),
      ];
    });
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amountMinor - a.amountMinor));
    return { month, today, items, markers: markers.sort((a, b) => (a.date < b.date ? -1 : 1)), totals: billTotals(items) };
  });
}
