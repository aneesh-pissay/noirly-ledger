import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listDuplicates } from "@/src/server/duplicates";

/** Recent transactions that look like one payment recorded twice, in pairs. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listDuplicates(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
