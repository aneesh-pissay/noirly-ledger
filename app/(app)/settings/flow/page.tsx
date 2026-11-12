import { FlowSettingsScreen } from "@/src/features/flow/FlowSettingsScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function FlowSettingsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { personal } = await requirePersonalWorkspace();
  const { workspace } = await searchParams;
  return <FlowSettingsScreen initialWorkspaceId={workspace && /^[a-f0-9]{24}$/i.test(workspace) ? workspace : personal.id} />;
}
