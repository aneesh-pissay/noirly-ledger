import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listMerchants } from "@/src/server/labels";

/** Merchants in the workspace's transactions, most used first, with what was spent at each. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ merchants: await listMerchants(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}
