import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { InstallmentPlan, Transaction as TransactionModel, type InstallmentPlanDocument } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { bulkCreateTransactions } from "@/src/server/bulk";
import { checkPlan, installmentSchedule, scheduleSummary } from "@/src/core/installments";
import type { CreateTransactionInput, InstallmentPlanSummary, LedgerSyncProvider } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

const day = (date: Date) => date.toISOString().slice(0, 10);

export type PlanInput = {
  name: string;
  principalMinor: number;
  currency: string;
  months: number;
  annualRatePct: number;
  taxOnInterestPct: number;
  processingFeeMinor: number;
  firstDate: string;
  accountId: string | null;
  categoryId: string | null;
};

function scheduleOf(plan: Pick<InstallmentPlanDocument, "principalMinor" | "months" | "annualRatePct" | "taxOnInterestPct" | "firstDate">) {
  return installmentSchedule({
    principalMinor: plan.principalMinor,
    months: plan.months,
    annualRatePct: plan.annualRatePct,
    taxOnInterestPct: plan.taxOnInterestPct,
    firstDate: day(plan.firstDate),
  });
}

async function summarize(plan: InstallmentPlanDocument): Promise<InstallmentPlanSummary> {
  const today = day(new Date());
  const live = await TransactionModel.find({ installmentPlanId: plan._id, deletedAt: null }).select("date amountMinor installmentNumber").lean();
  const installments = live.filter((t) => t.installmentNumber != null && t.installmentNumber > 0);
  const paid = installments.filter((t) => day(t.date) <= today);
  const upcoming = installments.filter((t) => day(t.date) > today).sort((a, b) => a.date.getTime() - b.date.getTime());
  const schedule = scheduleOf(plan);
  const lastPaid = Math.max(0, ...paid.map((t) => t.installmentNumber ?? 0));
  return {
    id: String(plan._id),
    name: plan.name,
    principalMinor: plan.principalMinor,
    currency: plan.currency,
    months: plan.months,
    annualRatePct: plan.annualRatePct,
    taxOnInterestPct: plan.taxOnInterestPct,
    processingFeeMinor: plan.processingFeeMinor,
    firstDate: day(plan.firstDate),
    accountId: plan.accountId ? String(plan.accountId) : null,
    categoryId: plan.categoryId ? String(plan.categoryId) : null,
    closed: Boolean(plan.closedAt),
    paidCount: paid.length,
    monthlyMinor: schedule[0]?.amountMinor ?? 0,
    // Everything still to come, a processing fee dated ahead included.
    leftToPayMinor: live.filter((t) => day(t.date) > today).reduce((sum, t) => sum + t.amountMinor, 0),
    principalLeftMinor: plan.closedAt ? 0 : (schedule[lastPaid - 1]?.balanceMinor ?? plan.principalMinor),
    nextDate: upcoming[0] ? day(upcoming[0].date) : null,
    ...(() => {
      const summary = scheduleSummary(schedule, plan.processingFeeMinor);
      return { costMinor: summary.costMinor, totalMinor: summary.totalMinor };
    })(),
  };
}

/**
 * Starts an EMI purchase: every installment is added as an expense on its
 * date (and the processing fee with the first), all or none, each pointing
 * back at the plan. Budgets see each month's installment in its month.
 */
export async function createInstallmentPlan(sync: LedgerSyncProvider, userId: string, workspaceId: string, input: PlanInput) {
  await withDb(() => requireMembershipRole(userId, workspaceId));
  const check = checkPlan(input);
  if (!check.ok) throw new ApiError(400, "invalid_request", check.error);
  const plan = await withDb(() =>
    InstallmentPlan.create({
      workspaceId: oid(workspaceId),
      name: input.name.trim(),
      principalMinor: input.principalMinor,
      currency: input.currency.toUpperCase(),
      months: input.months,
      annualRatePct: input.annualRatePct,
      taxOnInterestPct: input.taxOnInterestPct,
      processingFeeMinor: input.processingFeeMinor,
      firstDate: new Date(`${input.firstDate}T12:00:00.000Z`),
      accountId: input.accountId ? oid(input.accountId) : null,
      categoryId: input.categoryId ? oid(input.categoryId) : null,
      createdById: oid(userId),
    }),
  );
  const base = { workspaceId, type: "expense" as const, currency: plan.currency, categoryId: input.categoryId, accountId: input.accountId, clearing: "pending" as const };
  const rows = scheduleOf(plan);
  const inputs: CreateTransactionInput[] = rows.map((row) => ({ ...base, amountMinor: row.amountMinor, date: row.date, note: `${plan.name} · EMI ${row.number}/${plan.months}` }));
  if (input.processingFeeMinor > 0) inputs.unshift({ ...base, amountMinor: input.processingFeeMinor, date: input.firstDate, note: `${plan.name} · processing fee` });
  let created;
  try {
    created = await bulkCreateTransactions(sync, inputs);
  } catch (error) {
    await withDb(() => plan.deleteOne());
    throw error;
  }
  // Number 0 is the fee; 1..n the installments.
  const offset = input.processingFeeMinor > 0 ? 0 : 1;
  await withDb(() =>
    TransactionModel.bulkWrite(
      created.map((t, i) => ({ updateOne: { filter: { _id: new Types.ObjectId(t.id) }, update: { $set: { installmentPlanId: plan._id, installmentNumber: i + offset } } } })),
    ),
  );
  return withDb(() => summarize(plan));
}

export function listInstallmentPlans(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const plans = await InstallmentPlan.find({ workspaceId: oid(workspaceId) }).sort({ closedAt: 1, createdAt: -1 });
    return Promise.all(plans.map(summarize));
  });
}

async function requirePlan(userId: string, planId: string) {
  const plan = await withDb(() => InstallmentPlan.findById(oid(planId)));
  if (!plan) throw new ApiError(404, "not_found", "EMI plan not found");
  // Anyone who can add transactions can run an EMI plan; each payment's own edit rules still apply.
  await withDb(() => requireMembershipRole(userId, String(plan.workspaceId)));
  return plan;
}

/**
 * Pays off the rest in one go: the installments still to come are removed,
 * and one payment of the principal still owed (plus any foreclosure charge)
 * is added today.
 */
export async function closeInstallmentPlanEarly(sync: LedgerSyncProvider, userId: string, planId: string, chargeMinor: number) {
  const plan = await requirePlan(userId, planId);
  if (plan.closedAt) throw new ApiError(409, "already_closed", "This plan is already paid off");
  const today = day(new Date());
  const before = await withDb(() => summarize(plan));
  const upcoming = await withDb(() =>
    TransactionModel.find({ installmentPlanId: plan._id, deletedAt: null, date: { $gt: new Date(`${today}T23:59:59.999Z`) } }).select("_id").lean(),
  );
  for (const t of upcoming) await sync.deleteTransaction(String(t._id));
  const payoff = before.principalLeftMinor + chargeMinor;
  if (payoff > 0) {
    const [payment] = await bulkCreateTransactions(sync, [{
      workspaceId: String(plan.workspaceId),
      type: "expense",
      amountMinor: payoff,
      currency: plan.currency,
      categoryId: plan.categoryId ? String(plan.categoryId) : null,
      accountId: plan.accountId ? String(plan.accountId) : null,
      date: today,
      note: `${plan.name} · paid off early`,
    }]);
    await withDb(() => TransactionModel.updateOne({ _id: new Types.ObjectId(payment!.id) }, { $set: { installmentPlanId: plan._id, installmentNumber: -1 } }));
  }
  plan.closedAt = new Date();
  await withDb(() => plan.save());
  return withDb(() => summarize(plan));
}

/** Removes a plan and all its transactions; refused if any can't go (a reconciled one, say), so nothing is left half-removed. */
export async function deleteInstallmentPlan(sync: LedgerSyncProvider, userId: string, planId: string) {
  const plan = await requirePlan(userId, planId);
  const live = await withDb(() => TransactionModel.find({ installmentPlanId: plan._id, deletedAt: null }).select("_id clearing").lean());
  if (live.some((t) => t.clearing === "reconciled")) {
    throw new ApiError(409, "reconciled", "Some of its payments are reconciled. Mark them cleared first, or pay the plan off instead.");
  }
  for (const t of live) await sync.deleteTransaction(String(t._id));
  await withDb(() => plan.deleteOne());
}
