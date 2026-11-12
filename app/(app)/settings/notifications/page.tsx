import { NotificationSettingsScreen } from "@/src/features/notifications/NotificationSettingsScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function NotificationSettingsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { personal } = await requirePersonalWorkspace();
  const { workspace } = await searchParams;
  return <NotificationSettingsScreen initialWorkspaceId={workspace && /^[a-f0-9]{24}$/i.test(workspace) ? workspace : personal.id} />;
}
