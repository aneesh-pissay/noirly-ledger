import { getLedgerProvider, jsonError, jsonOk, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { inboundOptionsBodySchema } from "@/src/core/schemas/ledger";
import { deleteInboundAddress, getInbound, rotateInboundAddress, setInboundOptions } from "@/src/server/inbound-email";

type Params = { params: Promise<{ workspaceId: string }> };

/** The workspace's address for emailed receipts and bills, and what it got lately. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "The workspace's email address");
    return jsonOk(await getInbound(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Makes the address, or a new one in its place. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "The workspace's email address");
    await rotateInboundAddress(ctx.userId, workspaceId);
    return jsonOk(await getInbound(ctx.userId, workspaceId), 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = inboundOptionsBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "The workspace's email address");
    await setInboundOptions(ctx.userId, workspaceId, body);
    return jsonOk(await getInbound(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "The workspace's email address");
    await deleteInboundAddress(ctx.userId, workspaceId);
    return jsonOk(await getInbound(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
