import { RulesScreen } from "@/src/features/rules/RulesScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function RulesPage() {
  const { personal } = await requirePersonalWorkspace();
  return <RulesScreen workspaceId={personal.id} baseCurrency={personal.baseCurrency} canManage />;
}
