import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { deleteComment } from "@/src/server/transaction-activity";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  try {
    const { commentId } = await params;
    await assertObjectId(commentId, "commentId");
    const { ctx } = await getLedgerProvider();
    await deleteComment(ctx.userId, commentId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
