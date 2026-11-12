import { DeveloperScreen } from "@/src/features/developer/DeveloperScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function ApiSettingsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { personal } = await requirePersonalWorkspace();
  const { workspace } = await searchParams;
  return <DeveloperScreen initialWorkspaceId={workspace && /^[a-f0-9]{24}$/i.test(workspace) ? workspace : personal.id} />;
}
