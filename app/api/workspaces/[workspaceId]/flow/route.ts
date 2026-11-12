import { getLedgerProvider, jsonError, jsonOk, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { flowLinkBodySchema } from "@/src/core/schemas/ledger";
import { deleteFlowLink, getFlowLink, saveFlowLink } from "@/src/server/flow";

/** Your link from this workspace to Noirly Flow, if any, and whether Flow is set up here at all. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Linking Noirly Flow");
    return jsonOk(await getFlowLink(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = flowLinkBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Linking Noirly Flow");
    return jsonOk({ link: await saveFlowLink(ctx.userId, workspaceId, body) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Linking Noirly Flow");
    await deleteFlowLink(ctx.userId, workspaceId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
