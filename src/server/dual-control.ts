import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { LedgerUser, PendingAction, Workspace, WorkspaceMember, type PendingActionDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { notifyUsers } from "@/src/server/notifications/notify";
import { appendAudit } from "@/src/server/audit";
import { canonicalJson } from "@/src/core/audit";
import { roleOf } from "@/src/core/permissions/can";
import { DUAL_LABEL, PENDING_HOURS, pendingState, type DualKind, type PendingActionView, type PendingStatus } from "@/src/core/dual-control";

const oid = (id: string | Types.ObjectId) => {
  if (!Types.ObjectId.isValid(String(id))) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(String(id));
};

/** Set when a second owner agreed: the change is made as asked, without asking again. */
export type SecondApproval = { approvedById: string } | undefined;

async function otherOwners(workspaceId: Types.ObjectId, userId: string) {
  const owners = await WorkspaceMember.find({ workspaceId, role: "owner", userId: { $ne: oid(userId) } }).select("userId").lean();
  return owners.map((o) => String(o.userId));
}

async function nameOf(userId: string | Types.ObjectId | null | undefined) {
  if (!userId) return null;
  return (await LedgerUser.findById(userId).select("displayName").lean())?.displayName ?? "Someone";
}

function hrefFor(workspaceId: string) {
  return `/w/${workspaceId}/members`;
}

/**
 * Lets a sensitive change through, or holds it for a second owner. Held,
 * it's saved as a request, the other owners are told, and this throws 409
 * needs_second_approval, so the caller's change doesn't happen now.
 */
export async function requireSecondOwner(input: { actorId: string; workspaceId: string; kind: DualKind; payload: Record<string, unknown>; summary: string; approval: SecondApproval }) {
  if (input.approval) return;
  const workspaceId = oid(input.workspaceId);
  const workspace = await Workspace.findById(workspaceId).select("kind dualControl name").lean();
  if (!workspace || workspace.kind !== "team" || !workspace.dualControl) return;
  const others = await otherOwners(workspaceId, input.actorId);
  // No one else to ask: it's theirs alone.
  if (!others.length) return;

  const payload = JSON.parse(canonicalJson(input.payload)) as Record<string, unknown>;
  const now = new Date();
  const waiting = await PendingAction.find({ workspaceId, kind: input.kind, requestedById: oid(input.actorId), status: "pending", expiresAt: { $gt: now } }).lean();
  if (!waiting.some((p) => canonicalJson(p.payload) === canonicalJson(payload))) {
    const doc = await PendingAction.create({
      workspaceId,
      kind: input.kind,
      payload,
      summary: input.summary,
      requestedById: oid(input.actorId),
      expiresAt: new Date(now.getTime() + PENDING_HOURS * 3_600_000),
    });
    const asker = await nameOf(input.actorId);
    await notifyUsers({
      userIds: others,
      workspaceId: input.workspaceId,
      kind: "approval.requested",
      title: `${asker} asks you to agree: ${DUAL_LABEL[input.kind].toLowerCase()}`,
      body: `${input.summary}. It needs a second owner in ${workspace.name}; it waits ${PENDING_HOURS} hours.`,
      href: hrefFor(input.workspaceId),
    });
    await appendAudit({ workspaceId, actorId: input.actorId, action: "workspace.second_approval_requested", entity: "workspace", entityId: doc._id, summary: `Asked a second owner to agree: ${input.summary}`, data: { kind: input.kind, payload } });
  }
  throw new ApiError(409, "needs_second_approval", "This needs a second owner. They've been asked, and it happens once one of them agrees.");
}

/** Makes a held change, as whoever asked, now that a second owner agreed. Imports late: these modules use this one. */
async function perform(doc: PendingActionDocument, approvedById: string) {
  const approval = { approvedById };
  const requesterId = String(doc.requestedById);
  const workspaceId = String(doc.workspaceId);
  const p = doc.payload as Record<string, unknown>;
  switch (doc.kind as DualKind) {
    case "member.role": {
      const { updateMemberRole } = await import("@/src/server/workspace/members");
      await updateMemberRole({ actorId: requesterId, workspaceId, targetUserId: String(p.targetUserId), role: p.role as never, customRoleId: p.customRoleId as string | null | undefined, approval });
      return;
    }
    case "member.remove": {
      const { removeMember } = await import("@/src/server/workspace/members");
      await removeMember({ actorId: requesterId, workspaceId, targetUserId: String(p.targetUserId), approval });
      return;
    }
    case "approval_rule.create": {
      const { createApprovalRule } = await import("@/src/server/approval-rules");
      await createApprovalRule(requesterId, workspaceId, p.input as never, approval);
      return;
    }
    case "approval_rule.update": {
      const { updateApprovalRule } = await import("@/src/server/approval-rules");
      await updateApprovalRule(requesterId, workspaceId, String(p.ruleId), p.input as never, approval);
      return;
    }
    case "approval_rule.delete": {
      const { deleteApprovalRule } = await import("@/src/server/approval-rules");
      await deleteApprovalRule(requesterId, workspaceId, String(p.ruleId), approval);
      return;
    }
    case "approval_rule.reorder": {
      const { reorderApprovalRules } = await import("@/src/server/approval-rules");
      await reorderApprovalRules(requesterId, workspaceId, p.ids as string[], approval);
      return;
    }
    case "workspace.delete": {
      const { deleteWorkspace } = await import("@/src/server/retention");
      await deleteWorkspace(requesterId, workspaceId, String(p.confirmName), approval);
      return;
    }
    case "dual_control.off":
      await setDualControl(requesterId, workspaceId, false, approval);
      return;
  }
}

async function view(doc: PendingActionDocument, viewerId: string, isOwner: boolean, now: Date): Promise<PendingActionView> {
  const status = pendingState(doc.status as PendingStatus, doc.expiresAt, now);
  const mine = String(doc.requestedById) === viewerId;
  return {
    id: String(doc._id),
    kind: doc.kind as DualKind,
    label: DUAL_LABEL[doc.kind as DualKind],
    summary: doc.summary,
    status,
    requestedById: String(doc.requestedById),
    requestedByName: (await nameOf(doc.requestedById)) ?? "Someone",
    decidedByName: await nameOf(doc.decidedById),
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
    result: doc.result ?? null,
    canDecide: status === "pending" && isOwner && !mine,
    canCancel: status === "pending" && mine,
  };
}

/** The workspace's setting and its requests, newest first. Anyone in it can see them. */
export function listPendingActions(userId: string, workspaceId: string) {
  return withDb(async () => {
    const grant = await requireMembershipRole(userId, workspaceId);
    const workspace = await Workspace.findById(oid(workspaceId)).select("kind dualControl").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const owners = await WorkspaceMember.countDocuments({ workspaceId: oid(workspaceId), role: "owner" });
    const docs = await PendingAction.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: -1 }).limit(30).lean<PendingActionDocument[]>();
    const now = new Date();
    const isOwner = roleOf(grant) === "owner";
    return {
      enabled: Boolean(workspace.dualControl),
      available: workspace.kind === "team",
      owners,
      isOwner,
      actions: await Promise.all(docs.map((d) => view(d, userId, isOwner, now))),
    };
  });
}

/**
 * Turns two-person approval on (with at least two owners to share it) or
 * off (which itself takes a second owner while it's on).
 */
export async function setDualControl(userId: string, workspaceId: string, enabled: boolean, approval?: SecondApproval) {
  await withDb(async () => {
    await requireAction(userId, workspaceId, "workspace.manage");
    const workspace = await Workspace.findById(oid(workspaceId)).select("kind dualControl").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    if (workspace.kind !== "team") throw new ApiError(400, "invalid_request", "Two-person approval is for shared workspaces");
    if (Boolean(workspace.dualControl) === enabled) return;
    if (enabled && (await WorkspaceMember.countDocuments({ workspaceId: oid(workspaceId), role: "owner" })) < 2) {
      throw new ApiError(400, "invalid_request", "Make someone else an owner first: two-person approval needs two owners");
    }
    if (!enabled) await requireSecondOwner({ actorId: userId, workspaceId, kind: "dual_control.off", payload: {}, summary: "Stop asking a second owner to agree to sensitive changes", approval });
    await Workspace.updateOne({ _id: oid(workspaceId) }, { $set: { dualControl: enabled } });
    await appendAudit({ workspaceId, actorId: userId, action: enabled ? "workspace.dual_control_on" : "workspace.dual_control_off", entity: "workspace", entityId: workspaceId, summary: enabled ? "Sensitive changes now take a second owner" : "Sensitive changes no longer take a second owner", data: { approvedById: approval?.approvedById ?? null } });
  });
  return listPendingActions(userId, workspaceId);
}

/**
 * A second owner agrees (the change is made, as asked) or turns it down.
 * The one who asked can't decide their own; they can take it back instead.
 */
export function decidePendingAction(userId: string, actionId: string, decision: "approve" | "reject") {
  return withDb(async () => {
    const doc = await PendingAction.findById(oid(actionId)).lean<PendingActionDocument>();
    if (!doc) throw new ApiError(404, "not_found", "Request not found");
    const workspaceId = String(doc.workspaceId);
    const grant = await requireMembershipRole(userId, workspaceId);
    if (roleOf(grant) !== "owner") throw new ApiError(403, "forbidden", "Only an owner can agree to this");
    if (String(doc.requestedById) === userId) throw new ApiError(403, "forbidden", "It takes a second owner: someone other than whoever asked");
    const now = new Date();
    if (pendingState(doc.status as PendingStatus, doc.expiresAt, now) !== "pending") throw new ApiError(409, "conflict", "This request isn't waiting any more");
    // Claimed first, so two owners agreeing at once make it once.
    const claimed = await PendingAction.findOneAndUpdate(
      { _id: doc._id, status: "pending" },
      { $set: { status: decision === "approve" ? "approved" : "rejected", decidedById: oid(userId), decidedAt: now } },
      { returnDocument: "after" },
    ).lean<PendingActionDocument>();
    if (!claimed) throw new ApiError(409, "conflict", "Someone else decided it first");
    const decider = await nameOf(userId);
    let result: string | null = null;
    if (decision === "approve") {
      try {
        await perform(claimed, userId);
      } catch (error) {
        result = error instanceof Error ? error.message : "It couldn't be made";
        // Gone with the workspace when that was the change; otherwise say what went wrong.
        await PendingAction.updateOne({ _id: claimed._id }, { $set: { status: "failed", result } });
      }
    }
    const done = decision === "approve" && !result;
    const gone = claimed.kind === "workspace.delete" && done;
    // A deleted workspace has no audit history left to add to.
    if (!gone) await appendAudit({
      workspaceId,
      actorId: userId,
      action: decision === "approve" ? (done ? "workspace.second_approval_given" : "workspace.second_approval_failed") : "workspace.second_approval_refused",
      entity: "workspace",
      entityId: claimed._id,
      summary: `${decision === "approve" ? "Agreed to" : "Turned down"}: ${claimed.summary}${result ? ` (couldn't be made: ${result})` : ""}`,
      data: { kind: claimed.kind, requestedById: String(claimed.requestedById) },
    });
    await notifyUsers({
      userIds: [String(claimed.requestedById)],
      workspaceId: gone ? null : workspaceId,
      kind: "approval.decided",
      title: decision === "approve" ? (done ? `${decider} agreed: ${claimed.summary}` : `${decider} agreed, but it couldn't be made`) : `${decider} turned down: ${claimed.summary}`,
      body: result ?? (decision === "approve" ? "The change is made." : "Nothing was changed."),
      href: gone ? "/home" : hrefFor(workspaceId),
    });
    return { status: (result ? "failed" : claimed.status) as PendingStatus, result };
  });
}

/** Whoever asked takes it back. */
export function cancelPendingAction(userId: string, actionId: string) {
  return withDb(async () => {
    const res = await PendingAction.updateOne({ _id: oid(actionId), requestedById: oid(userId), status: "pending" }, { $set: { status: "cancelled", decidedAt: new Date() } });
    if (!res.modifiedCount) throw new ApiError(404, "not_found", "No waiting request of yours by that id");
  });
}
