import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Transaction as TransactionModel } from "@/src/server/models";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { upcomingRecurring } from "@/src/server/projection";
import { billStatus, billTotals, isMonth, monthBounds, type BillItem } from "@/src/core/bills";

/**
 * A month of bills: recurring expenses (the ones recorded, and the ones
 * still to come), EMI installments, and other expenses entered ahead of
 * their date. Transfers and income aren't bills.
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
    // Occurrences take their name and how often they repeat from their rule.
    const ruleIds = [...new Set(recorded.map((t) => t.recurringParentId).filter(Boolean).map(String))];
    const rules = new Map(
      (await TransactionModel.find({ _id: { $in: ruleIds.map((id) => new Types.ObjectId(id)) } }).select("merchant note recurrence").lean<TransactionDocument[]>()).map((r) => [String(r._id), r]),
    );

    const items: BillItem[] = recorded.map((t) => {
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
      };
    });

    const coming = (await upcomingRecurring(ws, last)).filter((o) => o.type === "expense" && o.date >= first && o.date <= last);
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
      });
    }
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amountMinor - a.amountMinor));
    return { month, today, items, totals: billTotals(items) };
  });
}
