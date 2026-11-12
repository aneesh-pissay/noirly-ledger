import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { syncFlowNow } from "@/src/server/flow";

/** Brings your Flow tasks up to date now, rather than with the daily run. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ link: await syncFlowNow(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}
