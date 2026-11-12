import { ReconciliationScreen } from "@/src/features/accounts/ReconciliationScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function ReconciliationPage() {
  const { personal } = await requirePersonalWorkspace();
  return <ReconciliationScreen workspaceId={personal.id} accountsPath="/accounts" />;
}
