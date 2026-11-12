import { PageContainer } from "@noirly-dev/ui";
import { can } from "@/src/core/permissions/can";
import { MembersPanel } from "@/src/features/workspace/MembersPanel";
import { DualControlPanel } from "@/src/features/workspace/DualControlPanel";
import { getLedgerProvider } from "@/src/server/api/http";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { ctx, sync } = await getLedgerProvider();
  const workspace = await sync.getWorkspace(workspaceId);

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Roles: owner, approver, member. Members can submit; approvers decide.
      </p>
      <div className="mt-6">
        <DualControlPanel workspaceId={workspaceId} />
      </div>
      <div className="mt-6">
        <MembersPanel
          workspaceId={workspaceId}
          currentUserId={ctx.userId}
          canManage={can(workspace.grant, "members.manage")}
          canInvite={can(workspace.grant, "members.invite")}
        />
      </div>
    </PageContainer>
  );
}
