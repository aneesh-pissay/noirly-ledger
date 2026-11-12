import { PoolDetail } from "@/src/features/pools/PoolDetail";
import { getLedgerProvider } from "@/src/server/api/http";

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; poolId: string }>;
}) {
  const { workspaceId, poolId } = await params;
  const { ctx, sync } = await getLedgerProvider();
  const workspace = await sync.getWorkspace(workspaceId);
  return <PoolDetail workspaceId={workspaceId} poolId={poolId} currentUserId={ctx.userId} baseCurrency={workspace.baseCurrency} />;
}
