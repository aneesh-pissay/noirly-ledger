import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { bulkChangeBodySchema } from "@/src/core/schemas/ledger";
import { bulkChangeTransactions } from "@/src/server/bulk";

/** Changes or deletes many transactions; each follows the one-at-a-time rules, and ones that can't change are listed. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = bulkChangeBodySchema.parse(await request.json());
    const { ctx, sync } = await getLedgerProvider();
    return jsonOk(await bulkChangeTransactions(sync, ctx.userId, workspaceId, body.ids, body.action));
  } catch (error) {
    return jsonError(error);
  }
}
