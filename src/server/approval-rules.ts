import { Types } from "mongoose";
import type { z } from "zod";
import { parseMajorToMinor } from "@/src/core/money";
import type { approvalRuleBodySchema } from "@/src/core/schemas/ledger";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ApprovalRule, BudgetPool, Category, WorkspaceMember, WorkspaceRole, type ApprovalRuleDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { can, customRolePermissions, type Grant } from "@/src/core/permissions/can";
import { chainFor, type ApprovalStepSpec, type Decider, type ExpenseFacts } from "@/src/core/approval-rules";
import type { MemberRole } from "@/src/core/models/enums";
import type { ApprovalRuleView } from "@/src/core/sync/types";
import { requireSecondOwner, type SecondApproval } from "@/src/server/dual-control";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

export type ApprovalRuleInput = {
  name: string;
  minAmountMinor: number | null;
  maxAmountMinor: number | null;
  categoryIds: string[];
  budgetPoolIds: string[];
  steps: ApprovalStepSpec[];
};

/** A rule body as the server keeps it: amounts in minor units, blank bounds open. */
export function ruleInput(body: z.infer<typeof approvalRuleBodySchema>): ApprovalRuleInput {
  return {
    name: body.name,
    minAmountMinor: body.minMajor ? parseMajorToMinor(body.minMajor) : null,
    maxAmountMinor: body.maxMajor ? parseMajorToMinor(body.maxMajor) : null,
    categoryIds: body.categoryIds,
    budgetPoolIds: body.budgetPoolIds,
    steps: body.steps,
  };
}

function mapRule(doc: ApprovalRuleDocument): ApprovalRuleView {
  return {
    id: String(doc._id),
    name: doc.name,
    order: doc.order,
    minAmountMinor: doc.minAmountMinor ?? null,
    maxAmountMinor: doc.maxAmountMinor ?? null,
    categoryIds: doc.categoryIds.map(String),
    budgetPoolIds: doc.budgetPoolIds.map(String),
    steps: doc.steps.map((s) => ({ kind: s.kind, userIds: s.userIds.map(String) })),
  };
}

/** Everyone in the workspace and what they may do: their built-in role, or their custom role's permissions. */
export async function memberGrants(workspaceId: Types.ObjectId): Promise<Array<{ userId: string; role: MemberRole; grant: Grant }>> {
  const [members, roles] = await Promise.all([
    WorkspaceMember.find({ workspaceId }).select("userId role customRoleId").lean(),
    WorkspaceRole.find({ workspaceId }).select("permissions").lean(),
  ]);
  const custom = new Map(roles.map((r) => [String(r._id), customRolePermissions(r.permissions)]));
  return members.map((m) => {
    const role = m.role as MemberRole;
    const permissions = m.customRoleId && role !== "owner" ? custom.get(String(m.customRoleId)) : undefined;
    return { userId: String(m.userId), role, grant: permissions ? { role, permissions } : role };
  });
}

/** Everyone in the workspace, and whether their role (built-in or custom) lets them decide expenses. */
export async function loadDeciders(workspaceId: Types.ObjectId): Promise<Decider[]> {
  return (await memberGrants(workspaceId)).map((m) => ({ userId: m.userId, role: m.role, canDecide: can(m.grant, "expense.decide") }));
}

/** The chain an expense needs under the workspace's rules. */
export async function chainForExpense(workspaceId: Types.ObjectId, expense: Omit<ExpenseFacts, "categoryParentId">) {
  const [rules, category] = await Promise.all([
    ApprovalRule.find({ workspaceId }).sort({ order: 1, createdAt: 1 }).lean(),
    expense.categoryId ? Category.findById(expense.categoryId).select("parentId").lean() : null,
  ]);
  return chainFor(rules.map(mapRule), { ...expense, categoryParentId: category?.parentId ? String(category.parentId) : null });
}

/** Only what's in this workspace: its categories, pools and members; a step naming nobody left in it is dropped. */
async function clean(workspaceId: Types.ObjectId, input: ApprovalRuleInput) {
  if (input.minAmountMinor !== null && input.maxAmountMinor !== null && input.minAmountMinor > input.maxAmountMinor) {
    throw new ApiError(400, "invalid_request", "The lowest amount is above the highest");
  }
  const ids = (list: string[]) => [...new Set(list)].map(oid);
  const [categories, pools, members] = await Promise.all([
    Category.find({ workspaceId, _id: { $in: ids(input.categoryIds) }, deletedAt: null }).select("_id").lean(),
    BudgetPool.find({ workspaceId, _id: { $in: ids(input.budgetPoolIds) } }).select("_id").lean(),
    WorkspaceMember.find({ workspaceId, userId: { $in: ids(input.steps.flatMap((s) => s.userIds)) } }).select("userId").lean(),
  ]);
  const inWorkspace = new Set(members.map((m) => String(m.userId)));
  const steps = input.steps
    .map((s) => ({ kind: s.kind, userIds: s.kind === "members" ? [...new Set(s.userIds)].filter((id) => inWorkspace.has(id)).map(oid) : [] }))
    .filter((s) => s.kind !== "members" || s.userIds.length > 0);
  if (!steps.length) throw new ApiError(400, "invalid_request", "A rule needs at least one approval step");
  return {
    name: input.name.trim(),
    minAmountMinor: input.minAmountMinor,
    maxAmountMinor: input.maxAmountMinor,
    categoryIds: categories.map((c) => c._id),
    budgetPoolIds: pools.map((p) => p._id),
    steps,
  };
}

/** The workspace's rules, in the order they're tried. Anyone in it can see them. */
export function listApprovalRules(userId: string, workspaceId: string): Promise<{ rules: ApprovalRuleView[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await ApprovalRule.find({ workspaceId: oid(workspaceId) }).sort({ order: 1, createdAt: 1 });
    return { rules: docs.map(mapRule) };
  });
}

/** Adds a rule, tried after the existing ones. Owners only: rules decide who approves. */
export function createApprovalRule(userId: string, workspaceId: string, input: ApprovalRuleInput, approval?: SecondApproval) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const ws = oid(workspaceId);
    await clean(ws, input);
    await requireSecondOwner({ actorId: userId, workspaceId, kind: "approval_rule.create", payload: { input }, summary: `Add the approval rule "${input.name}"`, approval });
    const last = await ApprovalRule.findOne({ workspaceId: ws }).sort({ order: -1 }).select("order").lean();
    const doc = await ApprovalRule.create({ workspaceId: ws, ...(await clean(ws, input)), order: (last?.order ?? -1) + 1, createdById: oid(userId) });
    return mapRule(doc);
  });
}

/** Changes a rule. Expenses already submitted keep the chain they started with. */
export function updateApprovalRule(userId: string, workspaceId: string, ruleId: string, input: ApprovalRuleInput, approval?: SecondApproval) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const ws = oid(workspaceId);
    const doc = await ApprovalRule.findOne({ _id: oid(ruleId), workspaceId: ws });
    if (!doc) throw new ApiError(404, "not_found", "Rule not found");
    await clean(ws, input);
    await requireSecondOwner({ actorId: userId, workspaceId, kind: "approval_rule.update", payload: { ruleId, input }, summary: `Change the approval rule "${doc.name}"`, approval });
    doc.set(await clean(ws, input));
    await doc.save();
    return mapRule(doc);
  });
}

export function deleteApprovalRule(userId: string, workspaceId: string, ruleId: string, approval?: SecondApproval) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const rule = await ApprovalRule.findOne({ _id: oid(ruleId), workspaceId: oid(workspaceId) }).select("name").lean();
    if (!rule) throw new ApiError(404, "not_found", "Rule not found");
    await requireSecondOwner({ actorId: userId, workspaceId, kind: "approval_rule.delete", payload: { ruleId }, summary: `Delete the approval rule "${rule.name}"`, approval });
    const res = await ApprovalRule.deleteOne({ _id: oid(ruleId), workspaceId: oid(workspaceId) });
    if (!res.deletedCount) throw new ApiError(404, "not_found", "Rule not found");
  });
}

/** Puts the rules in the order given (every rule, each once). */
export function reorderApprovalRules(userId: string, workspaceId: string, ids: string[], approval?: SecondApproval) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const ws = oid(workspaceId);
    const existing = (await ApprovalRule.find({ workspaceId: ws }).select("_id").lean()).map((r) => String(r._id));
    if (ids.length !== existing.length || new Set(ids).size !== ids.length || !ids.every((id) => existing.includes(id))) {
      throw new ApiError(400, "invalid_request", "List every rule once");
    }
    await requireSecondOwner({ actorId: userId, workspaceId, kind: "approval_rule.reorder", payload: { ids }, summary: "Change the order approval rules are tried in", approval });
    await ApprovalRule.bulkWrite(ids.map((id, order) => ({ updateOne: { filter: { _id: oid(id), workspaceId: ws }, update: { $set: { order } } } })));
    const docs = await ApprovalRule.find({ workspaceId: ws }).sort({ order: 1, createdAt: 1 });
    return { rules: docs.map(mapRule) };
  });
}
