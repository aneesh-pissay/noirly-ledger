import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { ApprovalRequest, Transaction, Workspace } from "@/src/server/models";
import { approvalChain, deadlinesOf } from "@/src/server/mappers";
import { loadDeciders } from "@/src/server/approval-rules";
import { expenseSummary, loadActiveDelegations, recordApprovalEvent } from "@/src/server/approval-history";
import { notifyUsers } from "@/src/server/notifications/notify";
import { stepNotifyIds } from "@/src/core/approval-rules";
import { escalationAction, waitingDays } from "@/src/core/deadlines";

/**
 * The daily chase of waiting approvals (src/core/deadlines.ts): a step past
 * its workspace's reminder line reminds whoever can decide it; past the
 * escalation line, the workspace's owners can decide it too and are told.
 * Each happens once per step, and goes in the approval history.
 */
export function runApprovalEscalations(now = new Date()) {
  return withDb(async () => {
    let reminded = 0;
    let escalated = 0;
    const workspaces = await Workspace.find({
      kind: "team",
      $or: [{ "approvalDeadlines.remindAfterDays": { $ne: null } }, { "approvalDeadlines.escalateAfterDays": { $ne: null } }],
    }).select("approvalDeadlines").lean();

    for (const ws of workspaces) {
      const settings = deadlinesOf(ws.approvalDeadlines);
      const waiting = await ApprovalRequest.find({ workspaceId: ws._id, status: "submitted" });
      if (!waiting.length) continue;
      const [deciders, delegations] = await Promise.all([loadDeciders(ws._id), loadActiveDelegations(ws._id)]);
      const txns = new Map((await Transaction.find({ _id: { $in: waiting.map((a) => a.transactionId) } }).select("note amountMinor currency").lean()).map((t) => [String(t._id), t]));

      for (const doc of waiting) {
        const { steps, currentStep } = approvalChain(doc);
        const step = steps[currentStep];
        if (!step?.startedAt) continue;
        const action = escalationAction({ since: step.startedAt, remindedAt: step.remindedAt, escalatedAt: step.escalatedAt }, now, settings);
        if (!action) continue;

        const at = now.toISOString();
        const updated = steps.map((s, i) => (i === currentStep ? { ...s, ...(action === "remind" ? { remindedAt: at } : { escalatedAt: at, remindedAt: s.remindedAt ?? at }) } : s));
        // Only while it still waits on this step, so a decision made meanwhile isn't overwritten.
        const claimed = await ApprovalRequest.updateOne(
          { _id: doc._id, status: "submitted", currentStep: currentStep === 0 ? { $in: [0, null] } : currentStep },
          { $set: { steps: updated.map((s) => ({ ...s, userIds: s.userIds.map((id) => new Types.ObjectId(id)) })) } },
        );
        if (!claimed.modifiedCount) continue;

        const txn = txns.get(String(doc.transactionId));
        const summary = txn ? expenseSummary(txn) : null;
        const days = waitingDays(step.startedAt, now);
        const request = { submittedById: String(doc.submittedById), steps: updated, currentStep };
        const workspaceId = String(ws._id);
        const href = `/w/${workspaceId}/approvals`;
        if (action === "remind") {
          reminded += 1;
          await notifyUsers({
            userIds: stepNotifyIds(request, deciders, delegations),
            workspaceId,
            kind: "approval.requested",
            title: `Expense waiting ${days} day${days === 1 ? "" : "s"}`,
            body: `${summary ?? "An expense"} still needs your approval.`,
            href,
          });
        } else {
          escalated += 1;
          const owners = deciders.filter((d) => d.role === "owner" && d.userId !== request.submittedById).map((d) => d.userId);
          await notifyUsers({
            userIds: owners,
            workspaceId,
            kind: "approval.requested",
            title: "Approval escalated to you",
            body: `${summary ?? "An expense"} has waited ${days} day${days === 1 ? "" : "s"}. Owners can decide it now.`,
            href,
          });
        }
        await recordApprovalEvent({
          workspaceId: ws._id,
          kind: action === "remind" ? "reminded" : "escalated",
          approvalId: doc._id,
          actorId: null,
          step: currentStep,
          stepCount: steps.length,
          note: `Waiting ${days} day${days === 1 ? "" : "s"}`,
          summary,
        });
      }
    }
    return { approvalsReminded: reminded, approvalsEscalated: escalated };
  });
}
