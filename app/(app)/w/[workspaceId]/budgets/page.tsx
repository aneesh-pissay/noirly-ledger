import { BudgetScreen } from "@/src/features/budgets/BudgetScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

export default async function SharedBudgetsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "budgets");
  return <BudgetScreen workspaceId={workspace.id} baseCurrency={workspace.baseCurrency} />;
}
