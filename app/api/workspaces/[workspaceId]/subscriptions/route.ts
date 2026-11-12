import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listSpottedSubscriptions } from "@/src/server/subscriptions";

/** Subscriptions spotted in past spending that aren't tracked as recurring bills yet. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listSpottedSubscriptions(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
