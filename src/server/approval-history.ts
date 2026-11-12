import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ApprovalDelegation, ApprovalEvent, LedgerUser, WorkspaceMember, type ApprovalDelegationDocument } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { notifyUsers } from "@/src/server/notifications/notify";
import { roleOf } from "@/src/core/permissions/can";
import { isoDate } from "@/src/core/budgets/period";
import { formatMoney } from "@/src/core/locale-format";
import { activeDelegations, delegationProblem, delegationState, type ApprovalEventKind, type ApprovalEventView, type DelegationView, type DelegationWindow } from "@/src/core/delegations";
import type { ActiveDelegation } from "@/src/core/approval-rules";
import { appendAudit } from "@/src/server/audit";
import { actionLabel } from "@/src/core/audit";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

const today = () => isoDate(new Date());

/** How an expense reads in the history: its note and amount. */
export function expenseSummary(txn: { note?: string | null; amountMinor: number; currency: string }) {
  return `${txn.note || "Expense"} · ${formatMoney(txn.amountMinor, txn.currency)}`;
}

/** Adds an entry to the approval history. Entries are never changed afterwards. */
export async function recordApprovalEvent(input: {
  workspaceId: Types.ObjectId;
  kind: ApprovalEventKind;
  approvalId?: Types.ObjectId | null;
  /** Null when Ledger itself does it. */
  actorId: string | null;
  otherUserId?: string | null;
  step?: number | null;
  stepCount?: number | null;
  note?: string | null;
  summary?: string | null;
}) {
  await ApprovalEvent.create({
    workspaceId: input.workspaceId,
    kind: input.kind,
    approvalId: input.approvalId ?? null,
    actorId: input.actorId ? oid(input.actorId) : null,
    otherUserId: input.otherUserId ? oid(input.otherUserId) : null,
    step: input.step ?? null,
    stepCount: input.stepCount ?? null,
    note: input.note ?? null,
    summary: input.summary ?? null,
  });
  await appendAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: `approval.${input.kind}`,
    entity: "approval",
    entityId: input.approvalId ?? null,
    summary: `${actionLabel(`approval.${input.kind}`)}${input.summary ? `: ${input.summary}` : ""}`,
    data: { step: input.step ?? null, stepCount: input.stepCount ?? null, note: input.note ?? null, otherUserId: input.otherUserId ?? null },
  });
}

/** The approval history, newest first: the whole workspace's, or one expense's. Anyone in the workspace can read it. */
export function listApprovalHistory(userId: string, workspaceId: string, query: { approvalId?: string; before?: string; limit?: number } = {}) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const filter: Record<string, unknown> = { workspaceId: oid(workspaceId) };
    if (query.approvalId) filter.approvalId = oid(query.approvalId);
    if (query.before) filter.at = { $lt: new Date(query.before) };
    const limit = Math.min(query.limit ?? 50, 200);
    const docs = await ApprovalEvent.find(filter).sort({ at: -1, _id: -1 }).limit(limit + 1).lean();
    const page = docs.slice(0, limit);
    const ids = [...new Set(page.flatMap((d) => [d.actorId ? String(d.actorId) : "", d.otherUserId ? String(d.otherUserId) : ""]).filter(Boolean))];
    const users = new Map((await LedgerUser.find({ _id: { $in: ids.map(oid) } }).select("displayName").lean()).map((u) => [String(u._id), u.displayName]));
    const events: ApprovalEventView[] = page.map((d) => ({
      id: String(d._id),
      kind: d.kind as ApprovalEventKind,
      approvalId: d.approvalId ? String(d.approvalId) : null,
      actorId: d.actorId ? String(d.actorId) : null,
      actorName: d.actorId ? users.get(String(d.actorId)) ?? "Unknown" : "Ledger",
      otherUserId: d.otherUserId ? String(d.otherUserId) : null,
      otherName: d.otherUserId ? users.get(String(d.otherUserId)) ?? "Unknown" : null,
      step: d.step ?? null,
      stepCount: d.stepCount ?? null,
      note: d.note ?? null,
      summary: d.summary ?? null,
      at: d.at.toISOString(),
    }));
    return { events, nextBefore: docs.length > limit ? events.at(-1)!.at : null };
  });
}

function windowOf(d: ApprovalDelegationDocument): DelegationWindow {
  return { fromUserId: String(d.fromUserId), toUserId: String(d.toUserId), startsOn: d.startsOn, endsOn: d.endsOn, endedAt: d.endedAt ? d.endedAt.toISOString() : null };
}

/** Delegations in effect today in the workspace. */
export async function loadActiveDelegations(workspaceId: Types.ObjectId): Promise<ActiveDelegation[]> {
  const day = today();
  const docs = await ApprovalDelegation.find({ workspaceId, endedAt: null, startsOn: { $lte: day }, endsOn: { $gte: day } }).lean();
  return activeDelegations(docs.map(windowOf), day);
}

/** Delegations not yet over: who is away, and who covers for them. */
export function listDelegations(userId: string, workspaceId: string): Promise<{ delegations: DelegationView[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const day = today();
    const docs = await ApprovalDelegation.find({ workspaceId: oid(workspaceId), endedAt: null, endsOn: { $gte: day } }).sort({ startsOn: 1 }).lean();
    const ids = [...new Set(docs.flatMap((d) => [String(d.fromUserId), String(d.toUserId)]))];
    const names = new Map((await LedgerUser.find({ _id: { $in: ids.map(oid) } }).select("displayName").lean()).map((u) => [String(u._id), u.displayName]));
    return {
      delegations: docs.map((d) => {
        const w = windowOf(d);
        return { ...w, id: String(d._id), fromName: names.get(w.fromUserId) ?? "Unknown", toName: names.get(w.toUserId) ?? "Unknown", note: d.note ?? null, state: delegationState(w, day) };
      }),
    };
  });
}

/** Names someone to approve for you between two days. They're told, and it goes in the history. */
export function createDelegation(userId: string, workspaceId: string, input: { toUserId: string; startsOn: string; endsOn: string; note?: string | null }) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    if (!(await WorkspaceMember.exists({ workspaceId: ws, userId: oid(input.toUserId) }))) {
      throw new ApiError(400, "invalid_request", "They aren't in this workspace");
    }
    const existing = await ApprovalDelegation.find({ workspaceId: ws, fromUserId: oid(userId), endedAt: null }).lean();
    const problem = delegationProblem({ fromUserId: userId, toUserId: input.toUserId, startsOn: input.startsOn, endsOn: input.endsOn }, today(), existing.map(windowOf));
    if (problem) throw new ApiError(400, "invalid_request", problem);
    const doc = await ApprovalDelegation.create({ workspaceId: ws, fromUserId: oid(userId), toUserId: oid(input.toUserId), startsOn: input.startsOn, endsOn: input.endsOn, note: input.note ?? null });
    await recordApprovalEvent({ workspaceId: ws, kind: "delegation.started", actorId: userId, otherUserId: input.toUserId, note: `${input.startsOn} to ${input.endsOn}${input.note ? `: ${input.note}` : ""}` });
    const from = await LedgerUser.findById(userId).select("displayName").lean();
    await notifyUsers({
      userIds: [input.toUserId],
      workspaceId,
      kind: "approval.requested",
      title: "You're covering approvals",
      body: `${from?.displayName ?? "Someone"} asked you to approve expenses for them from ${input.startsOn} to ${input.endsOn}.`,
      href: `/w/${workspaceId}/approvals`,
    });
    return { id: String(doc._id) };
  });
}

/** Ends a delegation now. The person away can, and so can an owner. */
export function endDelegation(userId: string, workspaceId: string, delegationId: string) {
  return withDb(async () => {
    const grant = await requireMembershipRole(userId, workspaceId);
    const doc = await ApprovalDelegation.findOne({ _id: oid(delegationId), workspaceId: oid(workspaceId) });
    if (!doc) throw new ApiError(404, "not_found", "Delegation not found");
    if (String(doc.fromUserId) !== userId && roleOf(grant) !== "owner") {
      throw new ApiError(403, "forbidden", "Only they or an owner can end it");
    }
    if (doc.endedAt) return;
    doc.endedAt = new Date();
    await doc.save();
    await recordApprovalEvent({ workspaceId: doc.workspaceId, kind: "delegation.ended", actorId: userId, otherUserId: String(doc.toUserId) });
  });
}
