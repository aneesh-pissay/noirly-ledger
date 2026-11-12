import { getLedgerProvider, jsonError, jsonOk, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { flowLookupBodySchema } from "@/src/core/schemas/ledger";
import { lookUpFlow } from "@/src/server/flow";

/** The Flow workspaces a token reaches, and a workspace's projects (a POST, so the token isn't in a URL). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = flowLookupBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Linking Noirly Flow");
    return jsonOk(await lookUpFlow(ctx.userId, workspaceId, body));
  } catch (error) {
    return jsonError(error);
  }
}
