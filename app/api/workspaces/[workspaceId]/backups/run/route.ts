import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { backUpNow } from "@/src/server/backups";

/** Makes a backup now (at most every few minutes). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ backup: await backUpNow(ctx.userId, workspaceId) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
