import { ReportsScreen } from "@/src/features/reports/ReportsScreen";
import { getLedgerProvider, listSessionWorkspaces } from "@/src/server/api/http";
import { hasSection, type WorkspacePurpose } from "@/src/core/workspace-purpose";

export default async function TeamReportsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = (await listSessionWorkspaces()).find((w) => w.id === workspaceId);
  const { ctx } = await getLedgerProvider();
  const purpose = workspace?.purpose === "personal" ? null : (workspace?.purpose as WorkspacePurpose | undefined) ?? null;
  return (
    <ReportsScreen
      workspaceId={workspaceId}
      kind="team"
      baseCurrency={workspace?.baseCurrency ?? "USD"}
      fiscalYearStartMonth={workspace?.fiscalYearStartMonth}
      // Report rows link to the transactions page, where the workspace has one.
      transactionsHref={purpose && hasSection(purpose, "transactions") ? `/w/${workspaceId}/transactions` : null}
      currentUserId={ctx.userId}
    />
  );
}
