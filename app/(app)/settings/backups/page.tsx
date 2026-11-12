import { BackupsScreen } from "@/src/features/backups/BackupsScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function BackupsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { personal } = await requirePersonalWorkspace();
  const { workspace } = await searchParams;
  return <BackupsScreen initialWorkspaceId={workspace && /^[a-f0-9]{24}$/i.test(workspace) ? workspace : personal.id} />;
}
