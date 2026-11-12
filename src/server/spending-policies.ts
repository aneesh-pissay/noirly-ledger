import { Types } from "mongoose";
import type { z } from "zod";
import { parseMajorToMinor } from "@/src/core/money";
import type { spendingPolicyBodySchema } from "@/src/core/schemas/ledger";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { BudgetPool, Category, SpendingPolicy, Workspace, type SpendingPolicyDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { toBaseAmount } from "@/src/server/fx";
import { formatMoney } from "@/src/core/locale-format";
import { cleanMerchant, merchantKey } from "@/src/core/labels";
import { submissionLateness } from "@/src/core/deadlines";
import { isoDate } from "@/src/core/budgets/period";
import { deadlinesOf } from "@/src/server/mappers";
import { memberLimitStatus } from "@/src/server/pool-rules";
import { policyViolations, type PolicyEnforcement, type PolicyFacts, type PolicyViolation, type SpendingPolicySpec, type SpendingPolicyView } from "@/src/core/spending-policies";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

export type SpendingPolicyInput = {
  name: string;
  categoryIds: string[];
  merchants: string[];
  budgetPoolIds: string[];
  maxAmountMinor: number | null;
  receiptOverMinor: number | null;
  disallowed: boolean;
  enforcement: PolicyEnforcement;
};

/** A policy body as kept: amounts in minor units, blank for none. */
export function policyInput(body: z.infer<typeof spendingPolicyBodySchema>): SpendingPolicyInput {
  return {
    name: body.name,
    categoryIds: body.categoryIds,
    merchants: body.merchants,
    budgetPoolIds: body.budgetPoolIds,
    maxAmountMinor: body.maxMajor ? parseMajorToMinor(body.maxMajor) : null,
    receiptOverMinor: body.receiptOverMajor ? parseMajorToMinor(body.receiptOverMajor) : null,
    disallowed: body.disallowed,
    enforcement: body.enforcement,
  };
}

function mapPolicy(doc: SpendingPolicyDocument): SpendingPolicyView {
  return {
    id: String(doc._id),
    name: doc.name,
    categoryIds: doc.categoryIds.map(String),
    merchants: doc.merchants,
    merchantNames: doc.merchantNames.length === doc.merchants.length ? doc.merchantNames : doc.merchants,
    budgetPoolIds: doc.budgetPoolIds.map(String),
    maxAmountMinor: doc.maxAmountMinor ?? null,
    receiptOverMinor: doc.receiptOverMinor ?? null,
    disallowed: doc.disallowed,
    enforcement: doc.enforcement as PolicyEnforcement,
  };
}

/** Only this workspace's categories and pools; merchants cleaned and each once. */
async function clean(workspaceId: Types.ObjectId, input: SpendingPolicyInput) {
  const ids = (list: string[]) => [...new Set(list)].map(oid);
  const [categories, pools] = await Promise.all([
    Category.find({ workspaceId, _id: { $in: ids(input.categoryIds) }, deletedAt: null }).select("_id").lean(),
    BudgetPool.find({ workspaceId, _id: { $in: ids(input.budgetPoolIds) } }).select("_id").lean(),
  ]);
  const names = new Map<string, string>();
  for (const raw of input.merchants) {
    let name: string | null;
    try {
      name = cleanMerchant(raw);
    } catch (error) {
      throw new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Invalid merchant");
    }
    if (name && !names.has(merchantKey(name)!)) names.set(merchantKey(name)!, name);
  }
  if (!input.disallowed && input.maxAmountMinor === null && input.receiptOverMinor === null) {
    throw new ApiError(400, "invalid_request", "Give the policy a limit, a receipt rule, or mark the spend not allowed");
  }
  return {
    name: input.name.trim(),
    categoryIds: categories.map((c) => c._id),
    merchants: [...names.keys()],
    merchantNames: [...names.values()],
    budgetPoolIds: pools.map((p) => p._id),
    maxAmountMinor: input.disallowed ? null : input.maxAmountMinor,
    receiptOverMinor: input.disallowed ? null : input.receiptOverMinor,
    disallowed: input.disallowed,
    enforcement: input.enforcement,
  };
}

export async function loadPolicies(workspaceId: Types.ObjectId): Promise<SpendingPolicySpec[]> {
  return (await SpendingPolicy.find({ workspaceId }).sort({ createdAt: 1 })).map(mapPolicy);
}

/** Top-level parents of the given categories, for policies that name a parent. */
export async function categoryParents(ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return new Map();
  const docs = await Category.find({ _id: { $in: wanted.map(oid) }, parentId: { $ne: null } }).select("parentId").lean();
  return new Map(docs.map((d) => [String(d._id), String(d.parentId)]));
}

/** How an expense breaks the policies, amounts said in the workspace's base currency. */
export function violationsOf(policies: readonly SpendingPolicySpec[], facts: PolicyFacts, baseCurrency: string): PolicyViolation[] {
  return policyViolations(policies, facts, (minor) => formatMoney(minor, baseCurrency));
}

/** Policies for an expense about to be submitted; throws when one stops it. */
export async function assertPolicies(workspaceId: Types.ObjectId, baseCurrency: string, facts: Omit<PolicyFacts, "categoryParentId">) {
  const [policies, parents] = await Promise.all([loadPolicies(workspaceId), categoryParents([facts.categoryId])]);
  const violations = violationsOf(policies, { ...facts, categoryParentId: facts.categoryId ? parents.get(facts.categoryId) ?? null : null }, baseCurrency);
  const blocked = violations.filter((v) => v.enforcement === "block");
  if (blocked.length) throw new ApiError(400, "policy_blocked", blocked.map((v) => v.message).join("; "));
  return violations;
}

/** What the policies say about an expense being filled in, before it's submitted. */
export function checkExpense(userId: string, workspaceId: string, input: { budgetPoolId: string; amountMinor: number; currency: string; date: string; categoryId: string | null; merchant: string | null; hasReceipt: boolean }) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = await Workspace.findById(oid(workspaceId)).select("baseCurrency approvalDeadlines").lean();
    if (!ws) throw new ApiError(404, "not_found", "Workspace not found");
    const baseAmountMinor = await toBaseAmount({ workspaceId: ws._id, amountMinor: input.amountMinor, currency: input.currency, baseCurrency: ws.baseCurrency, asOf: new Date(`${input.date}T12:00:00.000Z`) });
    const [policies, parents] = await Promise.all([loadPolicies(ws._id), categoryParents([input.categoryId])]);
    const violations = violationsOf(policies, {
      baseAmountMinor,
      categoryId: input.categoryId,
      categoryParentId: input.categoryId ? parents.get(input.categoryId) ?? null : null,
      merchantKey: merchantKey(input.merchant),
      budgetPoolId: input.budgetPoolId,
      hasReceipt: input.hasReceipt,
    }, ws.baseCurrency);
    // Past the submission deadline: said here too, so the form can warn before it's sent.
    const deadlines = deadlinesOf(ws.approvalDeadlines);
    const late = submissionLateness(input.date, isoDate(new Date()), deadlines);
    // Their limit in the pool, with this expense counted.
    const pool = await BudgetPool.findOne({ _id: oid(input.budgetPoolId), workspaceId: ws._id, archivedAt: null });
    const memberLimit = pool ? await memberLimitStatus(pool, userId, input.date, baseAmountMinor) : null;
    return { violations, lateSubmission: late ? { ...late, enforcement: deadlines.lateSubmission } : null, memberLimit };
  });
}

/** The workspace's policies. Anyone in it can see them. */
export function listPolicies(userId: string, workspaceId: string): Promise<{ policies: SpendingPolicyView[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    return { policies: (await SpendingPolicy.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: 1 })).map(mapPolicy) };
  });
}

/** Owners only: policies decide what people may spend. */
export function createPolicy(userId: string, workspaceId: string, input: SpendingPolicyInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const ws = oid(workspaceId);
    return mapPolicy(await SpendingPolicy.create({ workspaceId: ws, ...(await clean(ws, input)), createdById: oid(userId) }));
  });
}

export function updatePolicy(userId: string, workspaceId: string, policyId: string, input: SpendingPolicyInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const ws = oid(workspaceId);
    const doc = await SpendingPolicy.findOne({ _id: oid(policyId), workspaceId: ws });
    if (!doc) throw new ApiError(404, "not_found", "Policy not found");
    doc.set(await clean(ws, input));
    await doc.save();
    return mapPolicy(doc);
  });
}

export function deletePolicy(userId: string, workspaceId: string, policyId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const res = await SpendingPolicy.deleteOne({ _id: oid(policyId), workspaceId: oid(workspaceId) });
    if (!res.deletedCount) throw new ApiError(404, "not_found", "Policy not found");
  });
}
