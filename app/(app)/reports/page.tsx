import { ReportBuilder } from "@/src/features/reports/ReportBuilder";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function ReportsPage() {
  const { personal } = await requirePersonalWorkspace();
  return <ReportBuilder workspaceId={personal.id} kind="personal" fiscalYearStartMonth={personal.fiscalYearStartMonth} />;
}
