import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { retentionBodySchema } from "@/src/core/schemas/ledger";
import { getRetention, setRetention } from "@/src/server/retention";

type Params = { params: Promise<{ workspaceId: string }> };

/** How long the workspace keeps what it no longer uses. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await getRetention(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = retentionBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(await setRetention(ctx.userId, workspaceId, body));
  } catch (error) {
    return jsonError(error);
  }
}
