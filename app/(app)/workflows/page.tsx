import { WorkflowsScreen } from "@/src/features/workflows/WorkflowsScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function WorkflowsPage() {
  const { personal } = await requirePersonalWorkspace();
  return <WorkflowsScreen workspaceId={personal.id} kind="personal" baseCurrency={personal.baseCurrency} canManage />;
}
