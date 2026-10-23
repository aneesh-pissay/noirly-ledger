import { ImportScreen } from "@/src/features/imports/ImportScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

export default async function SharedImportPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "transactions");
  return <ImportScreen workspaceId={workspace.id} baseCurrency={workspace.baseCurrency} transactionsPath={`/w/${workspace.id}/transactions`} />;
}
