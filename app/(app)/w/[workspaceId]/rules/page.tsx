import { can } from "@/src/core/permissions/can";
import { RulesScreen } from "@/src/features/rules/RulesScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

/** Rules for a shared workspace's transactions, where it keeps transactions of its own. */
export default async function WorkspaceRulesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "transactions");
  return <RulesScreen workspaceId={workspaceId} baseCurrency={workspace.baseCurrency} canManage={can(workspace.grant, "budget.manage")} />;
}
