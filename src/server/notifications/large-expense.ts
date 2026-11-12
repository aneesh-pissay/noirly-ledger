import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { LedgerUser, Workspace, WorkspaceMember } from "@/src/server/models";
import { notifyUsers } from "@/src/server/notifications/notify";
import { largeExpenseWatchers } from "@/src/server/notification-prefs";
import { formatMoney } from "@/src/core/locale-format";

/**
 * Tells everyone who set a large-expense amount for the workspace about an
 * expense at least that big. In a team, not whoever added it.
 */
export async function maybeNotifyLargeExpense(input: {
  workspaceId: Types.ObjectId;
  createdById: string;
  baseAmountMinor: number;
  label: string;
}): Promise<void> {
  if (input.baseAmountMinor <= 0) return;
  await withDb(async () => {
    const watchers = await largeExpenseWatchers(input.workspaceId, input.baseAmountMinor);
    if (!watchers.length) return;
    const workspace = await Workspace.findById(input.workspaceId).select("kind baseCurrency").lean();
    if (!workspace) return;
    const team = workspace.kind === "team";
    // Only people still in the workspace.
    const members = new Set((await WorkspaceMember.find({ workspaceId: input.workspaceId, userId: { $in: watchers.map((w) => new Types.ObjectId(w.userId)) } }).select("userId").lean()).map((m) => String(m.userId)));
    const ids = watchers.map((w) => w.userId).filter((id) => members.has(id) && (!team || id !== input.createdById));
    if (!ids.length) return;
    const who = team ? (await LedgerUser.findById(new Types.ObjectId(input.createdById)).select("displayName").lean())?.displayName ?? "Someone" : null;
    await notifyUsers({
      userIds: ids,
      workspaceId: String(input.workspaceId),
      kind: "transaction.large",
      title: `Large expense: ${formatMoney(input.baseAmountMinor, workspace.baseCurrency)}`,
      body: `${who ? `${who} added ` : ""}${input.label}.`,
      href: team ? `/w/${input.workspaceId}/transactions` : "/transactions",
    });
  });
}
