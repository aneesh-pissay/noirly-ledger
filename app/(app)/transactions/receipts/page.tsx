import { ReceiptInboxScreen } from "@/src/features/receipts/ReceiptInboxScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function ReceiptsPage() {
  const { personal } = await requirePersonalWorkspace();
  return <ReceiptInboxScreen workspaceId={personal.id} transactionsPath="/transactions" />;
}
