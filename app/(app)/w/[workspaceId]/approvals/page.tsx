import { can, roleOf } from "@/src/core/permissions/can";
import { ApprovalRules } from "@/src/features/approvals/ApprovalRules";
import { AwayPanel } from "@/src/features/approvals/AwayPanel";
import { SpendingPolicies } from "@/src/features/approvals/SpendingPolicies";
import { DeadlineSettings } from "@/src/features/approvals/DeadlineSettings";
import { ApprovalsInbox } from "@/src/features/approvals/ApprovalsInbox";
import { getLedgerProvider } from "@/src/server/api/http";

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { ctx, sync } = await getLedgerProvider();
  const workspace = await sync.getWorkspace(workspaceId);
  return (
    <ApprovalsInbox workspaceId={workspaceId} currentUserId={ctx.userId}>
      {workspace.kind === "team" ? (
        <>
          <AwayPanel workspaceId={workspaceId} currentUserId={ctx.userId} isOwner={roleOf(workspace.grant) === "owner"} />
          <ApprovalRules workspaceId={workspaceId} baseCurrency={workspace.baseCurrency} canManage={can(workspace.grant, "members.manage")} />
          <SpendingPolicies workspaceId={workspaceId} baseCurrency={workspace.baseCurrency} canManage={can(workspace.grant, "members.manage")} />
          <DeadlineSettings workspaceId={workspaceId} settings={workspace.approvalDeadlines} canManage={can(workspace.grant, "workspace.manage")} />
        </>
      ) : null}
    </ApprovalsInbox>
  );
}
