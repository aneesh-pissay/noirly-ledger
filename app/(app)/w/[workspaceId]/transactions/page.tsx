import { TransactionScreen } from "@/src/features/transactions/TransactionScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

export default async function SharedTransactionsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "transactions");
  return <TransactionScreen workspaceId={workspace.id} baseCurrency={workspace.baseCurrency} basePath={`/w/${workspace.id}/transactions`} />;
}
