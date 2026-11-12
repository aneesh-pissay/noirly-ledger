import { ReconciliationScreen } from "@/src/features/accounts/ReconciliationScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

export default async function SharedReconciliationPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "accounts");
  return <ReconciliationScreen workspaceId={workspace.id} accountsPath={`/w/${workspace.id}/accounts`} />;
}
