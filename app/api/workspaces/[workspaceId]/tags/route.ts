import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listTags } from "@/src/server/labels";

/** Tags used in the workspace, most used first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ tags: await listTags(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}
