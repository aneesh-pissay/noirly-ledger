import { dueOccurrences } from "@/src/core/recurrence/next";
import { isoDate } from "@/src/core/budgets/period";
import { withDb } from "@/src/server/db/mongodb";
import { Transaction, Workspace, WorkspaceMember } from "@/src/server/models";
import { toBaseAmount } from "@/src/server/fx";
import { notifyUsers } from "@/src/server/notifications/notify";
import { maybeNotifyBudgetThreshold } from "@/src/server/notifications/budget-threshold";
import type { RecurrenceFrequency } from "@/src/core/models/enums";

function noonUtc(date: Date): Date {
  return new Date(`${isoDate(date)}T12:00:00.000Z`);
}

export async function runRecurringEngine(asOf = new Date()): Promise<{ created: number }> {
  return withDb(async () => {
    const templates = await Transaction.find({
      isRecurring: true,
      recurringParentId: null,
      deletedAt: null,
      recurrence: { $ne: null },
    });
    const baseCurrency = new Map<string, string>();

    let created = 0;
    for (const template of templates) {
      const rule = template.recurrence;
      if (!rule) continue;
      // Deleted occurrences count as posted: deleting one rent payment must
      // not make the next run post it again.
      const latest = await Transaction.findOne({
        recurringParentId: template._id,
      }).sort({ date: -1 });
      const lastPosted = latest?.date ?? template.date;
      const due = dueOccurrences(
        lastPosted,
        {
          frequency: rule.frequency as RecurrenceFrequency,
          interval: rule.interval,
          // Monthly rules keep the template's day: a rule from the 31st posts
          // on the 30th or 28th in short months, then goes back to the 31st.
          byMonthDay:
            rule.byMonthDay ?? (rule.frequency === "monthly" ? template.date.getUTCDate() : undefined),
          until: rule.until,
        },
        asOf,
      );

      const workspaceKey = template.workspaceId.toString();
      if (!baseCurrency.has(workspaceKey)) {
        const workspace = await Workspace.findById(template.workspaceId).select("baseCurrency").lean();
        baseCurrency.set(workspaceKey, workspace?.baseCurrency ?? template.currency);
      }

      let posted = 0;
      for (const date of due) {
        const stamp = noonUtc(date);
        // Each occurrence converts at the rate on its own date, falling back
        // to the template's amount only if no rate is set at all.
        const baseAmountMinor = await toBaseAmount({
          workspaceId: template.workspaceId,
          amountMinor: template.amountMinor,
          currency: template.currency,
          baseCurrency: baseCurrency.get(workspaceKey)!,
          asOf: stamp,
        }).catch(() => template.baseAmountMinor);

        // Insert only if this date was never posted (even if since deleted).
        const result = await Transaction.updateOne(
          { recurringParentId: template._id, date: stamp },
          {
            $setOnInsert: {
              workspaceId: template.workspaceId,
              type: template.type,
              amountMinor: template.amountMinor,
              currency: template.currency,
              baseAmountMinor,
              categoryId: template.categoryId,
              accountId: template.accountId ?? null,
              toAccountId: template.toAccountId ?? null,
              toAmountMinor: template.toAmountMinor ?? null,
              budgetPoolId: null,
              date: stamp,
              note: template.note,
              isRecurring: false,
              recurrence: null,
              recurringParentId: template._id,
              createdById: template.createdById,
              isPosted: true,
              deletedAt: null,
            },
          },
          { upsert: true },
        );
        if (!result.upsertedCount) continue;
        created += 1;
        posted += 1;

        if (template.type === "expense" && template.categoryId) {
          await maybeNotifyBudgetThreshold({
            workspaceId: workspaceKey,
            categoryId: template.categoryId.toString(),
            addedExpenseMinor: baseAmountMinor,
          });
        }
      }

      if (posted > 0) {
        const members = await WorkspaceMember.find({
          workspaceId: template.workspaceId,
        }).lean();
        await notifyUsers({
          userIds: members.map((m) => m.userId.toString()),
          workspaceId: workspaceKey,
          kind: "recurring.due",
          title: "Recurring transaction posted",
          body: `${posted} occurrence(s) generated from a recurring rule.`,
          href: "/recurring",
        });
      }
    }

    return { created };
  });
}
