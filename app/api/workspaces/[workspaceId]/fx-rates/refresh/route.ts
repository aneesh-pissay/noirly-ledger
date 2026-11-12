import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { refreshRatesNow } from "@/src/server/fx-auto";

/** Fetches today's rates for every currency the workspace uses. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await refreshRatesNow(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
