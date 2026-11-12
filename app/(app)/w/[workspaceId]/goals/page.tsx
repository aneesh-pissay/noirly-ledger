import { GoalsScreen } from "@/src/features/savings-goals/GoalsScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

export default async function SharedGoalsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "goals");
  return <GoalsScreen workspaceId={workspace.id} baseCurrency={workspace.baseCurrency} />;
}
