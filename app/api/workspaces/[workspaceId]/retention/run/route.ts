import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { applyRetentionNow } from "@/src/server/retention";

/** Applies the workspace's retention rules now, rather than with the daily run. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ removed: await applyRetentionNow(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}
