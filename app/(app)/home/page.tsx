import { PersonalDashboard } from "@/src/features/dashboard/PersonalDashboard";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function PersonalHomePage() {
  const { ctx, personal } = await requirePersonalWorkspace();
  return (
    <PersonalDashboard
      workspaceId={personal.id}
      baseCurrency={personal.baseCurrency}
      displayName={ctx.displayName}
      fiscalYearStartMonth={personal.fiscalYearStartMonth}
    />
  );
}
