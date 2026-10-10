import type { Types } from "mongoose";
import type { MemberRole } from "@/src/core/models/enums";
import {
  ApprovalRequest,
  Budget,
  BudgetPool,
  Category,
  FxRate,
  LedgerUser,
  Notification,
  SavingsGoal,
  Transaction,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
} from "@/src/server/models";
import { deleteReceipt } from "@/src/server/storage/receipts";

/**
 * Deletes a person's Ledger data when their Noirly account is deleted.
 *
 * - Their personal workspace, and team workspaces where nobody else is a
 *   member, are deleted with everything in them, receipt files included.
 * - In team workspaces shared with others they leave: membership,
 *   notifications and invites they created go. Expenses they submitted stay
 *   in the team's books (no longer linked to a person). If they owned the
 *   workspace, the most senior remaining member becomes owner.
 * - Finally their Ledger user (email, name, settings) is deleted.
 *
 * Idempotent: a second call for the same person finds nothing and returns false.
 */

const SUCCESSION: MemberRole[] = ["owner", "approver", "member"];

async function purgeWorkspace(workspaceId: Types.ObjectId): Promise<void> {
  const receipts = await Transaction.find({ workspaceId, receiptStorageKey: { $ne: null } })
    .select("receiptStorageKey")
    .lean();
  await Promise.all(receipts.map((t) => (t.receiptStorageKey ? deleteReceipt(t.receiptStorageKey) : undefined)));
  await Promise.all([
    Transaction.deleteMany({ workspaceId }),
    Budget.deleteMany({ workspaceId }),
    BudgetPool.deleteMany({ workspaceId }),
    Category.deleteMany({ workspaceId }),
    FxRate.deleteMany({ workspaceId }),
    SavingsGoal.deleteMany({ workspaceId }),
    ApprovalRequest.deleteMany({ workspaceId }),
    Notification.deleteMany({ workspaceId }),
    WorkspaceInvite.deleteMany({ workspaceId }),
    WorkspaceMember.deleteMany({ workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });
}

export type LedgerDeletionSummary = {
  deleted: boolean;
  workspacesDeleted: number;
  workspacesLeft: number;
};

export async function deleteLedgerAccountData(identitySub: string): Promise<LedgerDeletionSummary> {
  const user = await LedgerUser.findOne({ identitySub }).select("_id").lean();
  if (!user) return { deleted: false, workspacesDeleted: 0, workspacesLeft: 0 };
  const userId = user._id;

  const [memberships, owned] = await Promise.all([
    WorkspaceMember.find({ userId }).select("workspaceId").lean(),
    Workspace.find({ ownerUserId: userId }).select("_id").lean(),
  ]);
  const workspaceIds = new Map<string, Types.ObjectId>();
  for (const id of [...memberships.map((m) => m.workspaceId), ...owned.map((w) => w._id)]) {
    workspaceIds.set(String(id), id as Types.ObjectId);
  }

  let workspacesDeleted = 0;
  let workspacesLeft = 0;
  for (const workspaceId of workspaceIds.values()) {
    const workspace = await Workspace.findById(workspaceId).select("kind ownerUserId").lean();
    if (!workspace) continue;
    const others = await WorkspaceMember.find({ workspaceId, userId: { $ne: userId } })
      .select("userId role createdAt")
      .lean();

    if (workspace.kind === "personal" || others.length === 0) {
      await purgeWorkspace(workspaceId);
      workspacesDeleted += 1;
      continue;
    }

    if (String(workspace.ownerUserId) === String(userId)) {
      const successor = [...others].sort(
        (a, b) =>
          SUCCESSION.indexOf(a.role as MemberRole) - SUCCESSION.indexOf(b.role as MemberRole) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )[0]!;
      await Promise.all([
        Workspace.updateOne({ _id: workspaceId }, { $set: { ownerUserId: successor.userId } }),
        WorkspaceMember.updateOne({ _id: successor._id }, { $set: { role: "owner" } }),
      ]);
    }
    await WorkspaceMember.deleteMany({ workspaceId, userId });
    workspacesLeft += 1;
  }

  // What is left of them in shared workspaces.
  await Promise.all([
    Notification.deleteMany({ userId }),
    WorkspaceInvite.deleteMany({ createdById: userId }),
  ]);
  await LedgerUser.deleteOne({ _id: userId });

  return { deleted: true, workspacesDeleted, workspacesLeft };
}
