import { can } from "@/src/core/permissions/can";
import { AutomationsScreen } from "@/src/features/automations/AutomationsScreen";
import { getLedgerProvider } from "@/src/server/api/http";

export default async function WorkspaceAutomationsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { sync } = await getLedgerProvider();
  const workspace = await sync.getWorkspace(workspaceId);
  return <AutomationsScreen workspaceId={workspaceId} canManage={can(workspace.grant, "budget.manage")} />;
}
