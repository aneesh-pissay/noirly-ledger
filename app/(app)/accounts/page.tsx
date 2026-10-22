import { AccountsScreen } from "@/src/features/accounts/AccountsScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function AccountsPage() {
  const { personal } = await requirePersonalWorkspace();
  return <AccountsScreen workspaceId={personal.id} baseCurrency={personal.baseCurrency} />;
}
