import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listCards } from "@/src/server/credit-cards";

/** Each credit card with its statement terms and where its bill stands. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listCards(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
