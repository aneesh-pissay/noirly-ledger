import { can } from "@/src/core/permissions/can";
import { WorkflowsScreen } from "@/src/features/workflows/WorkflowsScreen";
import { getLedgerProvider } from "@/src/server/api/http";

export default async function WorkspaceWorkflowsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { sync } = await getLedgerProvider();
  const workspace = await sync.getWorkspace(workspaceId);
  return <WorkflowsScreen workspaceId={workspaceId} kind="team" baseCurrency={workspace.baseCurrency} canManage={can(workspace.grant, "budget.manage")} />;
}
