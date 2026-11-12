import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { endDelegation } from "@/src/server/approval-history";

/** Ends a delegation now (it stays in the history). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; delegationId: string }> },
) {
  try {
    const { workspaceId, delegationId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(delegationId, "delegationId");
    const { ctx } = await getLedgerProvider();
    await endDelegation(ctx.userId, workspaceId, delegationId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
