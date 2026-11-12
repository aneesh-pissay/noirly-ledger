import { AutomationsScreen } from "@/src/features/automations/AutomationsScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function AutomationsPage() {
  const { personal } = await requirePersonalWorkspace();
  return <AutomationsScreen workspaceId={personal.id} canManage />;
}
