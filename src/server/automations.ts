import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Automation, Budget, Category, SavingsGoal, Workspace, WorkspaceMember, type AutomationDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { notifyUsers } from "@/src/server/notifications/notify";
import { budgetCategoryIds } from "@/src/server/categories/tree";
import { spentInCategories } from "@/src/server/splits";
import { recordRevision } from "@/src/server/budget-revisions";
import { budgetVsActualReport, insightsReport, spendingReport } from "@/src/server/reports";
import { createMongoLedgerProvider } from "@/src/server/providers/mongo-ledger-provider";
import { formatMoney } from "@/src/core/locale-format";
import { isoDate } from "@/src/core/budgets/period";
import { coveredRange, describeSchedule, nextRunOn, runAfter } from "@/src/core/export-schedules";
import { automationProblem, digestText, refreshedLimit, sweepAmount, type AutomationBody, type AutomationKind, type AutomationView } from "@/src/core/automations";
import type { ExportFrequency } from "@/src/core/export-schedules";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

function view(doc: AutomationDocument): AutomationView {
  return {
    id: String(doc._id),
    name: doc.name,
    kind: doc.kind as AutomationKind,
    frequency: doc.frequency as ExportFrequency,
    runDay: doc.runDay,
    params: {
      recipientIds: doc.params.recipientIds.map(String),
      email: doc.params.email,
      months: doc.params.months,
      adjustPct: doc.params.adjustPct,
      categoryIds: doc.params.categoryIds.map(String),
      goalId: doc.params.goalId ? String(doc.params.goalId) : null,
      sweepPct: doc.params.sweepPct,
    },
    schedule: describeSchedule({ frequency: doc.frequency as ExportFrequency, runDay: doc.runDay }).replace(/, for the (week|month) before$/, ""),
    nextRunOn: doc.nextRunOn,
    paused: doc.paused,
    lastRunAt: doc.lastRunAt ? doc.lastRunAt.toISOString() : null,
    lastResult: doc.lastResult ?? null,
    lastOk: doc.lastOk ?? null,
  };
}

/** Checks an automation: what its kind needs, a valid day, and only members, categories and goals of this workspace. */
async function clean(workspaceId: Types.ObjectId, input: AutomationBody) {
  const problem = automationProblem(input.kind, input.frequency, input.params);
  if (problem) throw new ApiError(400, "invalid_request", problem);
  const maxDay = input.frequency === "weekly" ? 7 : 28;
  if (!Number.isInteger(input.runDay) || input.runDay < 1 || input.runDay > maxDay) throw new ApiError(400, "invalid_request", "Pick a day");
  const p = input.params;
  if (input.kind === "digest") {
    const found = await WorkspaceMember.countDocuments({ workspaceId, userId: { $in: p.recipientIds.map(oid) } });
    if (found !== new Set(p.recipientIds).size) throw new ApiError(400, "invalid_request", "Digests only go to members of this workspace");
  }
  if (input.kind === "budget_refresh" && p.categoryIds.length) {
    const found = await Category.countDocuments({ workspaceId, _id: { $in: p.categoryIds.map(oid) } });
    if (found !== new Set(p.categoryIds).size) throw new ApiError(400, "invalid_request", "Those categories aren't all in this workspace");
  }
  if (input.kind === "sweep" && !(await SavingsGoal.exists({ _id: oid(p.goalId!), workspaceId }))) throw new ApiError(400, "invalid_request", "That goal isn't in this workspace");
  return {
    name: input.name.trim(),
    kind: input.kind,
    frequency: input.frequency,
    runDay: input.runDay,
    params: {
      recipientIds: input.kind === "digest" ? [...new Set(p.recipientIds)].map(oid) : [],
      email: input.kind === "digest" && p.email,
      months: p.months,
      adjustPct: p.adjustPct,
      categoryIds: input.kind === "budget_refresh" ? [...new Set(p.categoryIds)].map(oid) : [],
      goalId: input.kind === "sweep" && p.goalId ? oid(p.goalId) : null,
      sweepPct: p.sweepPct,
    },
  };
}

export function listAutomations(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    return { automations: (await Automation.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: 1 })).map(view) };
  });
}

/** They change budgets and goals, so they're set up by those who manage budgets. */
export function createAutomation(userId: string, workspaceId: string, input: AutomationBody) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const fields = await clean(ws, input);
    return view(await Automation.create({ workspaceId: ws, createdById: oid(userId), ...fields, nextRunOn: nextRunOn(fields, isoDate(new Date())) }));
  });
}

export function updateAutomation(userId: string, workspaceId: string, id: string, input: AutomationBody & { paused?: boolean }) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const doc = await Automation.findOne({ _id: oid(id), workspaceId: ws });
    if (!doc) throw new ApiError(404, "not_found", "Automation not found");
    const fields = await clean(ws, input);
    const timing = fields.frequency !== doc.frequency || fields.runDay !== doc.runDay;
    doc.set(fields);
    if (input.paused !== undefined) doc.paused = input.paused;
    if (timing) doc.nextRunOn = nextRunOn(fields, isoDate(new Date()));
    await doc.save();
    return view(doc);
  });
}

export function deleteAutomation(userId: string, workspaceId: string, id: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const res = await Automation.deleteOne({ _id: oid(id), workspaceId: oid(workspaceId) });
    if (!res.deletedCount) throw new ApiError(404, "not_found", "Automation not found");
  });
}

/** The first and last day of each of the `n` whole months before the one `day` is in, oldest first. */
function monthsBefore(day: string, n: number) {
  const [y, m] = day.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const back = n - i;
    return {
      from: isoDate(new Date(Date.UTC(y, m - 1 - back, 1))),
      to: isoDate(new Date(Date.UTC(y, m - back, 0))),
    };
  });
}

/** Does what an automation does for a run on `runOn`; says what happened. Acts as whoever set it up. */
async function perform(doc: AutomationDocument, runOn: string): Promise<string> {
  const actor = String(doc.createdById);
  const workspaceId = String(doc.workspaceId);
  const workspace = await Workspace.findById(doc.workspaceId).select("baseCurrency").lean();
  if (!workspace) throw new Error("The workspace is gone");
  const money = (minor: number) => formatMoney(minor, workspace.baseCurrency);

  if (doc.kind === "digest") {
    const range = coveredRange(doc.frequency as ExportFrequency, runOn);
    const [spending, budgets, insights] = await Promise.all([
      spendingReport(actor, workspaceId, range),
      budgetVsActualReport(actor, workspaceId, range),
      insightsReport(actor, workspaceId, range),
    ]);
    const { title, body } = digestText(
      {
        ...range,
        incomeMinor: insights.savings.incomeMinor,
        expenseMinor: insights.savings.expenseMinor,
        savingsRatePct: insights.savings.savingsRatePct,
        changePct: spending.changePct,
        topCategories: spending.categories.filter((c) => c.amountMinor > 0).slice(0, 3).map((c) => ({ name: c.name, amountMinor: c.amountMinor })),
        overBudgets: budgets.budgets.filter((b) => b.totals.varianceMinor < 0).map((b) => ({ name: b.name, overMinor: -b.totals.varianceMinor })),
        unusual: insights.unusual.slice(0, 3).map((u) => ({ title: u.note || u.merchantName || u.categoryName || "Expense", amountMinor: u.amountMinor })),
      },
      money,
    );
    // Only people still in the workspace.
    const members = await WorkspaceMember.find({ workspaceId: doc.workspaceId, userId: { $in: doc.params.recipientIds } }).select("userId").lean();
    const ids = members.map((m) => String(m.userId));
    if (!ids.length) throw new Error("Nobody to send it to");
    // Picked recipients asked for it, so a digest set to email goes by email whatever their settings.
    const reached = await notifyUsers({ userIds: ids, workspaceId, kind: "workflow", title, body, href: null, alsoEmail: doc.params.email });
    return `Sent to ${reached.length}`;
  }

  if (doc.kind === "budget_refresh") {
    const months = monthsBefore(runOn, doc.params.months);
    const filter: Record<string, unknown> = { workspaceId: doc.workspaceId, period: "monthly" };
    if (doc.params.categoryIds.length) filter.categoryId = { $in: doc.params.categoryIds };
    const budgets = await Budget.find(filter);
    let changed = 0;
    for (const budget of budgets) {
      const ids = await budgetCategoryIds(budget.categoryId);
      const spent: number[] = [];
      for (const m of months) {
        spent.push(await spentInCategories({ workspaceId: doc.workspaceId, isPosted: true, deletedAt: null, date: { $gte: new Date(`${m.from}T00:00:00.000Z`), $lte: new Date(`${m.to}T23:59:59.999Z`) } }, ids));
      }
      const limit = refreshedLimit(spent, doc.params.adjustPct);
      if (limit === null || limit === budget.limitAmountMinor) continue;
      const previous = budget.limitAmountMinor;
      budget.limitAmountMinor = limit;
      await budget.save();
      await recordRevision({ budget, previousLimitMinor: previous, limitMinor: limit, reason: "automated", userId: actor, note: `${doc.name}: average of ${doc.params.months} month${doc.params.months === 1 ? "" : "s"}${doc.params.adjustPct ? ` ${doc.params.adjustPct > 0 ? "+" : ""}${doc.params.adjustPct}%` : ""}` });
      changed += 1;
    }
    return `Changed ${changed} of ${budgets.length} budget${budgets.length === 1 ? "" : "s"}`;
  }

  // Sweep: last month's monthly budgets, the limit each had then against what was spent.
  const range = coveredRange("monthly", runOn);
  const report = await budgetVsActualReport(actor, workspaceId, range);
  const periods = report.budgets.filter((b) => b.period === "monthly").flatMap((b) => b.periods.filter((p) => p.from === range.from && p.to === range.to));
  const amount = sweepAmount(periods, doc.params.sweepPct);
  if (amount <= 0) return "Nothing unspent to sweep";
  const goal = await SavingsGoal.findById(doc.params.goalId).select("currency name").lean();
  if (!goal) throw new Error("The goal is gone");
  if (goal.currency !== workspace.baseCurrency) throw new Error(`The goal is in ${goal.currency}, the budgets in ${workspace.baseCurrency}`);
  await createMongoLedgerProvider({ userId: actor }).contributeToGoal(String(goal._id), amount, range.to);
  return `Put ${money(amount)} into ${goal.name}`;
}

async function runOne(doc: AutomationDocument, runOn: string) {
  let result: string;
  let ok = true;
  try {
    result = await perform(doc, runOn);
  } catch (error) {
    ok = false;
    result = error instanceof Error ? error.message : "It didn't work";
  }
  doc.lastRunAt = new Date();
  doc.lastResult = result;
  doc.lastOk = ok;
  return { ok, result };
}

/** Runs an automation now, for the period its next run would cover; its schedule doesn't move. */
export function runAutomationNow(userId: string, workspaceId: string, id: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const doc = await Automation.findOne({ _id: oid(id), workspaceId: oid(workspaceId) });
    if (!doc) throw new ApiError(404, "not_found", "Automation not found");
    await runOne(doc, isoDate(new Date()));
    await doc.save();
    return view(doc);
  });
}

/** The daily run: every automation due today or earlier runs once and moves to its next date. A failure tells whoever set it up. */
export function runDueAutomations(now = new Date()) {
  return withDb(async () => {
    const today = isoDate(now);
    const due = await Automation.find({ paused: false, nextRunOn: { $lte: today } });
    let ran = 0;
    let failed = 0;
    for (const doc of due) {
      const next = runAfter({ frequency: doc.frequency as ExportFrequency, runDay: doc.runDay }, today);
      // Claimed first, so two runs at once don't both do it.
      const claimed = await Automation.updateOne({ _id: doc._id, nextRunOn: doc.nextRunOn }, { $set: { nextRunOn: next } });
      if (!claimed.modifiedCount) continue;
      const { ok, result } = await runOne(doc, today);
      doc.nextRunOn = next;
      await doc.save();
      if (ok) ran += 1;
      else {
        failed += 1;
        await notifyUsers({ userIds: [String(doc.createdById)], workspaceId: String(doc.workspaceId), kind: "report.failed", title: `"${doc.name}" didn't run`, body: result, href: null });
      }
    }
    return { automationsRan: ran, automationsFailed: failed };
  });
}
