import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { matchAll } from "@/src/server/receipt-inbox";

/** Matches every receipt whose transaction is clear; the rest are left to pick by hand. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx, sync } = await getLedgerProvider();
    return jsonOk(await matchAll(sync, ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
