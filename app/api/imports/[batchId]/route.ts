import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { rollbackImport } from "@/src/server/imports/service";

/** Undoes a statement import, deleting what it added. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await params;
    await assertObjectId(batchId, "batchId");
    const { ctx, sync } = await getLedgerProvider();
    return jsonOk({ batch: await rollbackImport(sync, ctx.userId, batchId) });
  } catch (error) {
    return jsonError(error);
  }
}
