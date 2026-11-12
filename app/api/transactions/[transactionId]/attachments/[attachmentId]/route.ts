import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { removeAttachment } from "@/src/server/transaction-activity";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string; attachmentId: string }> },
) {
  try {
    const { transactionId, attachmentId } = await params;
    await assertObjectId(transactionId, "transactionId");
    await assertObjectId(attachmentId, "attachmentId");
    const { ctx } = await getLedgerProvider();
    await removeAttachment(ctx.userId, transactionId, attachmentId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
