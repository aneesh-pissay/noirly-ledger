import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { verifyAudit } from "@/src/server/audit";

/** Checks the whole chain: whether any entry was changed, removed or slipped in. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await verifyAudit(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
