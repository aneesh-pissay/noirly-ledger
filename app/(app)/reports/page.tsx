import { ReportsScreen } from "@/src/features/reports/ReportsScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function ReportsPage() {
  const { ctx, personal } = await requirePersonalWorkspace();
  return (
    <ReportsScreen
      workspaceId={personal.id}
      kind="personal"
      baseCurrency={personal.baseCurrency}
      fiscalYearStartMonth={personal.fiscalYearStartMonth}
      transactionsHref="/transactions"
      currentUserId={ctx.userId}
    />
  );
}
