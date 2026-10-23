import { AccountsScreen } from "@/src/features/accounts/AccountsScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

export default async function SharedAccountsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "accounts");
  return <AccountsScreen workspaceId={workspace.id} baseCurrency={workspace.baseCurrency} transactionsPath={`/w/${workspace.id}/transactions`} />;
}
