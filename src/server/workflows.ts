import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import {
  BudgetPool,
  Category,
  LedgerUser,
  Project,
  Transaction,
  TransactionComment,
  Workflow,
  WorkflowRun,
  Workspace,
  WorkspaceMember,
  type WorkflowDocument,
} from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { loadDeciders } from "@/src/server/approval-rules";
import { notifyUsers } from "@/src/server/notifications/notify";
import { sendLedgerEmail } from "@/src/server/mail/send";
import { recordChange } from "@/src/server/transaction-activity";
import { formatMoney } from "@/src/core/locale-format";
import { isoDate } from "@/src/core/budgets/period";
import { normalizeTags } from "@/src/core/labels";
import {
  allMatch,
  renderTemplate,
  workflowProblem,
  type Action,
  type Condition,
  type EventFacts,
  type Trigger,
  type WorkflowBody,
  type WorkflowView,
} from "@/src/core/workflows";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

async function view(doc: WorkflowDocument): Promise<WorkflowView> {
  const runs = await WorkflowRun.find({ workflowId: doc._id }).sort({ at: -1 }).limit(10).lean();
  return {
    id: String(doc._id),
    name: doc.name,
    enabled: doc.enabled,
    trigger: doc.trigger as Trigger,
    conditions: doc.conditions.map((c) => ({ field: c.field, op: c.op, value: c.value }) as Condition),
    actions: doc.actions as Action[],
    runCount: doc.runCount,
    lastRunAt: doc.lastRunAt ? doc.lastRunAt.toISOString() : null,
    runs: runs.map((r) => ({ id: String(r._id), at: r.at.toISOString(), ok: r.ok, summary: r.summary ?? null, results: r.results })),
  };
}

/** Checks a workflow, and that every category, project and person it names is in this workspace. */
async function clean(workspaceId: Types.ObjectId, input: WorkflowBody) {
  const actions = input.actions.map((a) => (a.type === "add_tags" ? { ...a, tags: normalizeTags(a.tags) } : a));
  const problem = workflowProblem({ ...input, actions });
  if (problem) throw new ApiError(400, "invalid_request", problem);
  for (const a of actions) {
    if (a.type === "set_category" && !(await Category.exists({ _id: oid(a.categoryId), workspaceId, deletedAt: null }))) throw new ApiError(400, "invalid_request", "That category isn't in this workspace");
    if (a.type === "set_project" && !(await Project.exists({ _id: oid(a.projectId), workspaceId }))) throw new ApiError(400, "invalid_request", "That project isn't in this workspace");
    if ((a.type === "notify" || a.type === "email") && a.audience === "people") {
      const found = await WorkspaceMember.countDocuments({ workspaceId, userId: { $in: a.userIds.map(oid) } });
      if (found !== new Set(a.userIds).size) throw new ApiError(400, "invalid_request", "Only members of this workspace can be told");
    }
  }
  return { name: input.name.trim(), enabled: input.enabled, trigger: input.trigger, conditions: input.conditions, actions };
}

export function listWorkflows(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await Workflow.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: 1 });
    return { workflows: await Promise.all(docs.map(view)) };
  });
}

/** Workflows act on everyone's transactions, so they're set up by those who manage budgets. */
export function createWorkflow(userId: string, workspaceId: string, input: WorkflowBody) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    return view(await Workflow.create({ workspaceId: ws, ...(await clean(ws, input)), createdById: oid(userId) }));
  });
}

export function updateWorkflow(userId: string, workspaceId: string, id: string, input: WorkflowBody) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const doc = await Workflow.findOne({ _id: oid(id), workspaceId: ws });
    if (!doc) throw new ApiError(404, "not_found", "Workflow not found");
    doc.set(await clean(ws, input));
    doc.markModified("actions");
    await doc.save();
    return view(doc);
  });
}

export function deleteWorkflow(userId: string, workspaceId: string, id: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const res = await Workflow.deleteOne({ _id: oid(id), workspaceId: oid(workspaceId) });
    if (!res.deletedCount) throw new ApiError(404, "not_found", "Workflow not found");
    await WorkflowRun.deleteMany({ workflowId: oid(id) });
  });
}

export type WorkflowEvent = {
  workspaceId: Types.ObjectId;
  trigger: Trigger;
  transactionId?: Types.ObjectId | null;
  /** For a budget alert: the budget's category and how far along it is. */
  budget?: { categoryId: string; pct: number } | null;
};

/**
 * Runs the workspace's workflows for an event. Never throws: a workflow
 * that fails is recorded as a failed run, and what set it off goes ahead.
 */
export async function fireWorkflows(event: WorkflowEvent): Promise<void> {
  try {
    const workflows = await Workflow.find({ workspaceId: event.workspaceId, trigger: event.trigger, enabled: true });
    if (!workflows.length) return;
    const workspace = await Workspace.findById(event.workspaceId).select("kind baseCurrency").lean();
    if (!workspace) return;
    const txn = event.transactionId ? await Transaction.findById(event.transactionId).lean() : null;
    const categoryId = txn ? (txn.categoryId ? String(txn.categoryId) : txn.splits?.[0]?.categoryId ? String(txn.splits[0].categoryId) : null) : event.budget?.categoryId ?? null;
    const category = categoryId ? await Category.findById(categoryId).select("name parentId").lean() : null;
    const memberId = txn ? String(txn.createdById) : null;
    const [member, pool] = await Promise.all([
      memberId ? LedgerUser.findById(memberId).select("displayName").lean() : null,
      txn?.budgetPoolId ? BudgetPool.findById(txn.budgetPoolId).select("name").lean() : null,
    ]);
    const facts: EventFacts = {
      type: txn?.type ?? null,
      amountMinor: txn ? txn.baseAmountMinor : null,
      categoryId,
      categoryParentId: category?.parentId ? String(category.parentId) : null,
      merchant: txn?.merchant ?? null,
      accountId: txn?.accountId ? String(txn.accountId) : null,
      tags: txn?.tags ?? [],
      poolId: txn?.budgetPoolId ? String(txn.budgetPoolId) : null,
      memberId,
    };
    const ws = String(event.workspaceId);
    const vars = {
      amount: txn ? formatMoney(txn.amountMinor, txn.currency) : "",
      merchant: txn?.merchant ?? "",
      category: category?.name ?? "",
      note: txn?.note ?? "",
      date: txn ? isoDate(txn.date) : isoDate(new Date()),
      member: member?.displayName ?? "",
      pool: pool?.name ?? "",
      percent: event.budget ? `${event.budget.pct}%` : "",
    };
    const summary = txn ? `${txn.note || txn.merchant || txn.type} · ${vars.amount}` : event.budget ? `${vars.category} budget at ${vars.percent}` : null;
    const href = event.trigger.startsWith("expense.")
      ? `/w/${ws}/approvals`
      : event.trigger === "budget.alert"
        ? workspace.kind === "personal" ? "/budgets" : `/w/${ws}/budgets`
        : workspace.kind === "personal" ? "/transactions" : `/w/${ws}/transactions`;

    for (const wf of workflows) {
      if (!allMatch(wf.conditions as Condition[], facts)) continue;
      const results: string[] = [];
      let ok = true;
      const message = (text: string) => renderTemplate(text, { ...vars, workflow: wf.name });
      for (const action of wf.actions as Action[]) {
        try {
          results.push(await runAction(action, { wf, event, txnId: txn?._id ?? null, hasSplits: Boolean(txn?.splits?.length), memberId, message, href, ws }));
        } catch (error) {
          ok = false;
          results.push(`${action.type} failed: ${error instanceof Error ? error.message : "error"}`);
        }
      }
      await WorkflowRun.create({ workspaceId: event.workspaceId, workflowId: wf._id, trigger: event.trigger, transactionId: txn?._id ?? null, summary, results, ok });
      await Workflow.updateOne({ _id: wf._id }, { $inc: { runCount: 1 }, $set: { lastRunAt: new Date() } });
    }
  } catch (error) {
    console.error("workflows failed", error);
  }
}

type RunContext = {
  wf: WorkflowDocument;
  event: WorkflowEvent;
  txnId: Types.ObjectId | null;
  hasSplits: boolean;
  memberId: string | null;
  message: (text: string) => string;
  href: string;
  ws: string;
};

/** Who an action is for, as user ids. */
async function audienceOf(action: Extract<Action, { type: "notify" | "email" }>, ctx: RunContext) {
  if (action.audience === "member") return ctx.memberId ? [ctx.memberId] : [];
  if (action.audience === "people") {
    // Only people still in the workspace.
    const members = await WorkspaceMember.find({ workspaceId: ctx.event.workspaceId, userId: { $in: action.userIds.map(oid) } }).select("userId").lean();
    return members.map((m) => String(m.userId));
  }
  const deciders = await loadDeciders(ctx.event.workspaceId);
  return deciders.filter((d) => (action.audience === "owners" ? d.role === "owner" : d.canDecide)).map((d) => d.userId);
}

/** Does one action; says what it did. What it changes is written straight to the transaction, so no workflow runs again. */
async function runAction(action: Action, ctx: RunContext): Promise<string> {
  const actor = String(ctx.wf.createdById);
  const detail = `Workflow: ${ctx.wf.name}`;
  if (action.type === "notify" || action.type === "email") {
    const people = await audienceOf(action, ctx);
    if (!people.length) return `${action.type}: nobody to tell`;
    const text = ctx.message(action.message);
    if (action.type === "notify") {
      await notifyUsers({ userIds: people, workspaceId: ctx.ws, kind: "workflow", title: ctx.wf.name, body: text, href: ctx.href });
      return `Notified ${people.length}`;
    }
    const users = await LedgerUser.find({ _id: { $in: people.map(oid) } }).select("email").lean();
    let sent = 0;
    for (const u of users) if (u.email && (await sendLedgerEmail({ to: u.email, subject: ctx.wf.name, text }))) sent += 1;
    return `Emailed ${sent} of ${users.length}`;
  }
  if (!ctx.txnId) return `${action.type}: no transaction`;
  if (action.type === "comment") {
    await TransactionComment.create({ workspaceId: ctx.event.workspaceId, transactionId: ctx.txnId, authorId: oid(actor), body: `[${ctx.wf.name}] ${ctx.message(action.message)}`.slice(0, 2000) });
    return "Commented";
  }
  if (action.type === "add_tags") {
    const before = await Transaction.findById(ctx.txnId).select("tags").lean();
    const tags = [...new Set([...(before?.tags ?? []), ...action.tags])];
    if (tags.length === (before?.tags ?? []).length) return "Tags already there";
    await Transaction.updateOne({ _id: ctx.txnId }, { $set: { tags } });
    await recordChange({ workspaceId: ctx.event.workspaceId, transactionId: ctx.txnId, actorId: actor, action: "updated", changes: [{ field: "tags", from: (before?.tags ?? []).join(", ") || null, to: tags.join(", ") }], detail });
    return `Tagged ${action.tags.map((t) => `#${t}`).join(" ")}`;
  }
  if (action.type === "set_category") {
    // A split keeps its lines' categories.
    if (ctx.hasSplits) return "Split: category left as it is";
    const before = await Transaction.findById(ctx.txnId).select("categoryId").lean();
    if (String(before?.categoryId) === action.categoryId) return "Category already set";
    await Transaction.updateOne({ _id: ctx.txnId }, { $set: { categoryId: oid(action.categoryId) } });
    await recordChange({ workspaceId: ctx.event.workspaceId, transactionId: ctx.txnId, actorId: actor, action: "updated", changes: [{ field: "categoryId", from: before?.categoryId ? String(before.categoryId) : null, to: action.categoryId }], detail });
    return "Category set";
  }
  if (action.type !== "set_project") return `${action.type}: unknown action`;
  const before = await Transaction.findById(ctx.txnId).select("projectId").lean();
  if (String(before?.projectId) === action.projectId) return "Project already set";
  await Transaction.updateOne({ _id: ctx.txnId }, { $set: { projectId: oid(action.projectId) } });
  await recordChange({ workspaceId: ctx.event.workspaceId, transactionId: ctx.txnId, actorId: actor, action: "updated", changes: [{ field: "projectId", from: before?.projectId ? String(before.projectId) : null, to: action.projectId }], detail });
  return "Project set";
}
