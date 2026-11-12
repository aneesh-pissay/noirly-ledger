import { ReimbursementsScreen } from "@/src/features/reimbursements/ReimbursementsScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";
import { getLedgerProvider } from "@/src/server/api/http";

export default async function ReimbursementsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "reimbursements");
  const { ctx } = await getLedgerProvider();
  return <ReimbursementsScreen workspaceId={workspaceId} currentUserId={ctx.userId} baseCurrency={workspace.baseCurrency} />;
}
