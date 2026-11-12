import { ReceiptInboxScreen } from "@/src/features/receipts/ReceiptInboxScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

export default async function SharedReceiptsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "transactions");
  return <ReceiptInboxScreen workspaceId={workspace.id} transactionsPath={`/w/${workspace.id}/transactions`} />;
}
