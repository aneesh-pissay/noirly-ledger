import { ReportBuilder } from "@/src/features/reports/ReportBuilder";
import { listSessionWorkspaces } from "@/src/server/api/http";

export default async function TeamReportsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = (await listSessionWorkspaces()).find((w) => w.id === workspaceId);
  return <ReportBuilder workspaceId={workspaceId} kind="team" fiscalYearStartMonth={workspace?.fiscalYearStartMonth} />;
}
