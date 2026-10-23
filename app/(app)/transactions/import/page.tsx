import { ImportScreen } from "@/src/features/imports/ImportScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function ImportPage() {
  const { personal } = await requirePersonalWorkspace();
  return <ImportScreen workspaceId={personal.id} baseCurrency={personal.baseCurrency} transactionsPath="/transactions" />;
}
