import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { undoPayout } from "@/src/server/reimbursements";

/** Undoes a payout recorded by mistake; what it paid is owed again. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; payoutId: string }> },
) {
  try {
    const { workspaceId, payoutId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(payoutId, "payoutId");
    const { ctx } = await getLedgerProvider();
    await undoPayout(ctx.userId, workspaceId, payoutId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
