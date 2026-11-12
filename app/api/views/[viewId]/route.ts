import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { deleteView } from "@/src/server/views";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ viewId: string }> },
) {
  try {
    const { viewId } = await params;
    await assertObjectId(viewId, "viewId");
    const { ctx } = await getLedgerProvider();
    await deleteView(ctx.userId, viewId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
