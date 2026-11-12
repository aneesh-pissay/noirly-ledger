import { Types } from "mongoose";
import type { z } from "zod";
import { parseMajorToMinor } from "@/src/core/money";
import type { transactionRuleBodySchema } from "@/src/core/schemas/ledger";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account, Category, Project, Transaction, TransactionRule, type TransactionRuleDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { recordChange } from "@/src/server/transaction-activity";
import { cleanMerchant, merchantKey, normalizeTags } from "@/src/core/labels";
import { applyRules, ruleProblem, rulesApplyTo, type RuleSpec, type RuleView, type TextField, type TextOp } from "@/src/core/auto-rules";
import type { CreateTransactionInput } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

export type RuleInput = Omit<RuleSpec, "id">;

/** A rule body as kept: amounts in minor units, blank bounds open. */
export function ruleInputFromBody(body: z.infer<typeof transactionRuleBodySchema>): RuleInput {
  return {
    name: body.name,
    field: body.field,
    op: body.op,
    value: body.value,
    type: body.type,
    accountId: body.accountId,
    minMinor: body.minMajor ? parseMajorToMinor(body.minMajor) : null,
    maxMinor: body.maxMajor ? parseMajorToMinor(body.maxMajor) : null,
    set: { categoryId: body.set.categoryId, merchant: body.set.merchant?.trim() || null, tags: body.set.tags, projectId: body.set.projectId },
  };
}

function view(doc: TransactionRuleDocument): RuleView {
  return {
    id: String(doc._id),
    name: doc.name,
    order: doc.order,
    field: doc.field as TextField,
    op: doc.op as TextOp,
    value: doc.value,
    type: (doc.type as RuleSpec["type"]) ?? null,
    accountId: doc.accountId ? String(doc.accountId) : null,
    minMinor: doc.minMinor ?? null,
    maxMinor: doc.maxMinor ?? null,
    set: {
      categoryId: doc.set.categoryId ? String(doc.set.categoryId) : null,
      merchant: doc.set.merchant ?? null,
      tags: doc.set.tags ?? [],
      projectId: doc.set.projectId ? String(doc.set.projectId) : null,
    },
    appliedCount: doc.appliedCount,
  };
}

/** The workspace's rules, in the order they're tried. */
export async function loadRules(workspaceId: Types.ObjectId): Promise<RuleSpec[]> {
  return (await TransactionRule.find({ workspaceId }).sort({ order: 1, createdAt: 1 })).map(view);
}

/** Checks a rule: something to look for and to set, and only this workspace's account, category and project. */
async function clean(workspaceId: Types.ObjectId, input: RuleInput) {
  // Checked first: a merchant or tag that can't be cleaned is the caller's mistake.
  const problem = ruleProblem(input);
  if (problem) throw new ApiError(400, "invalid_request", problem);
  const merchant = input.set.merchant ? cleanMerchant(input.set.merchant) : null;
  const tags = normalizeTags(input.set.tags);
  const [account, category, project] = await Promise.all([
    input.accountId ? Account.exists({ _id: oid(input.accountId), workspaceId }) : true,
    input.set.categoryId ? Category.exists({ _id: oid(input.set.categoryId), workspaceId, deletedAt: null }) : true,
    input.set.projectId ? Project.exists({ _id: oid(input.set.projectId), workspaceId }) : true,
  ]);
  if (!account || !category || !project) throw new ApiError(400, "invalid_request", "That account, category or project isn't in this workspace");
  return {
    name: input.name.trim(),
    field: input.field,
    op: input.op,
    value: input.value.trim(),
    type: input.type,
    accountId: input.accountId ? oid(input.accountId) : null,
    minMinor: input.minMinor,
    maxMinor: input.maxMinor,
    set: {
      categoryId: input.set.categoryId ? oid(input.set.categoryId) : null,
      merchant,
      tags,
      projectId: input.set.projectId ? oid(input.set.projectId) : null,
    },
  };
}

export function listRules(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await TransactionRule.find({ workspaceId: oid(workspaceId) }).sort({ order: 1, createdAt: 1 });
    return { rules: docs.map(view) };
  });
}

/** Rules shape everyone's categories, so they're set up like categories: by those who manage budgets. */
export function createRule(userId: string, workspaceId: string, input: RuleInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const last = await TransactionRule.findOne({ workspaceId: ws }).sort({ order: -1 }).select("order").lean();
    return view(await TransactionRule.create({ workspaceId: ws, ...(await clean(ws, input)), order: (last?.order ?? -1) + 1, createdById: oid(userId) }));
  });
}

export function updateRule(userId: string, workspaceId: string, ruleId: string, input: RuleInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const doc = await TransactionRule.findOne({ _id: oid(ruleId), workspaceId: ws });
    if (!doc) throw new ApiError(404, "not_found", "Rule not found");
    doc.set(await clean(ws, input));
    await doc.save();
    return view(doc);
  });
}

export function deleteRule(userId: string, workspaceId: string, ruleId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const res = await TransactionRule.deleteOne({ _id: oid(ruleId), workspaceId: oid(workspaceId) });
    if (!res.deletedCount) throw new ApiError(404, "not_found", "Rule not found");
  });
}

export function reorderRules(userId: string, workspaceId: string, ids: string[]) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const existing = (await TransactionRule.find({ workspaceId: ws }).select("_id").lean()).map((r) => String(r._id));
    if (ids.length !== existing.length || new Set(ids).size !== ids.length || !ids.every((id) => existing.includes(id))) {
      throw new ApiError(400, "invalid_request", "List every rule once");
    }
    await TransactionRule.bulkWrite(ids.map((id, order) => ({ updateOne: { filter: { _id: oid(id), workspaceId: ws }, update: { $set: { order } } } })));
    return listRules(userId, workspaceId);
  });
}

/**
 * A new transaction with what its workspace's rules fill in: category,
 * merchant and project only where it has none, tags added to its own.
 */
export async function withRules(workspaceId: Types.ObjectId, input: CreateTransactionInput, rules?: RuleSpec[]): Promise<{ input: CreateTransactionInput; ruleIds: string[] }> {
  if (!rulesApplyTo(input.type)) return { input, ruleIds: [] };
  const list = rules ?? (await loadRules(workspaceId));
  if (!list.length) return { input, ruleIds: [] };
  const result = applyRules(
    list,
    { type: input.type, note: input.note ?? null, merchant: input.merchant ?? null, accountId: input.accountId ?? null, amountMinor: input.amountMinor },
    { categoryId: Boolean(input.categoryId || input.splits?.length), merchant: Boolean(input.merchant), projectId: Boolean(input.projectId) },
  );
  if (!result.ruleIds.length) return { input, ruleIds: [] };
  return {
    input: {
      ...input,
      ...(result.categoryId ? { categoryId: result.categoryId } : {}),
      ...(result.merchant ? { merchant: result.merchant } : {}),
      ...(result.projectId ? { projectId: result.projectId } : {}),
      ...(result.tags.length ? { tags: [...new Set([...(input.tags ?? []), ...result.tags])] } : {}),
    },
    ruleIds: result.ruleIds,
  };
}

/** Counts a rule's uses. */
export async function countUses(ruleIds: string[], times = 1) {
  if (!ruleIds.length) return;
  await TransactionRule.updateMany({ _id: { $in: ruleIds.map(oid) } }, { $inc: { appliedCount: times } });
}

/**
 * Runs the rules over past expenses and income, filling only what's empty.
 * With `dryRun`, says how many would change without changing them. Each
 * change goes in the transaction's history. Newest first, up to 5,000.
 */
export function applyRulesToPast(userId: string, workspaceId: string, dryRun: boolean) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const rules = await loadRules(ws);
    if (!rules.length) return { changed: 0, scanned: 0 };
    const docs = await Transaction.find({ workspaceId: ws, deletedAt: null, type: { $in: ["expense", "income"] } })
      .sort({ date: -1 })
      .limit(5_000)
      .select("type note merchant accountId amountMinor categoryId splits projectId tags")
      .lean();
    const uses = new Map<string, number>();
    let changed = 0;
    for (const t of docs) {
      const result = applyRules(
        rules,
        { type: t.type, note: t.note ?? null, merchant: t.merchant ?? null, accountId: t.accountId ? String(t.accountId) : null, amountMinor: t.amountMinor },
        { categoryId: Boolean(t.categoryId || t.splits?.length), merchant: Boolean(t.merchant), projectId: Boolean(t.projectId) },
      );
      const newTags = result.tags.filter((tag) => !(t.tags ?? []).includes(tag));
      if (!result.categoryId && !result.merchant && !result.projectId && !newTags.length) continue;
      changed += 1;
      if (dryRun) continue;
      const set: Record<string, unknown> = {};
      const changes = [];
      if (result.categoryId) {
        set.categoryId = oid(result.categoryId);
        changes.push({ field: "categoryId" as const, from: null, to: result.categoryId });
      }
      if (result.merchant) {
        set.merchant = result.merchant;
        set.merchantKey = merchantKey(result.merchant);
        changes.push({ field: "merchant" as const, from: null, to: result.merchant });
      }
      if (result.projectId) {
        set.projectId = oid(result.projectId);
        changes.push({ field: "projectId" as const, from: null, to: result.projectId });
      }
      if (newTags.length) {
        const tags = [...(t.tags ?? []), ...newTags];
        set.tags = tags;
        changes.push({ field: "tags" as const, from: (t.tags ?? []).join(", ") || null, to: tags.join(", ") });
      }
      await Transaction.updateOne({ _id: t._id }, { $set: set });
      await recordChange({ workspaceId: ws, transactionId: t._id, actorId: userId, action: "updated", changes, detail: "Filled in by rules" });
      for (const id of result.ruleIds) uses.set(id, (uses.get(id) ?? 0) + 1);
    }
    for (const [id, n] of uses) await countUses([id], n);
    return { changed, scanned: docs.length };
  });
}
