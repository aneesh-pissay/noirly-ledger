import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { envelopeStartBodySchema } from "@/src/core/schemas/ledger";
import { getEnvelopes, listEnvelopeMoves, startEnvelopes } from "@/src/server/envelopes";

/** Envelopes, what's ready to assign, and the latest moves. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    const [envelopes, moves] = await Promise.all([getEnvelopes(ctx.userId, workspaceId), listEnvelopeMoves(ctx.userId, workspaceId)]);
    return jsonOk({ envelopes, moves });
  } catch (error) {
    return jsonError(error);
  }
}

/** Starts (or restarts) envelopes from a day. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = envelopeStartBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ envelopes: await startEnvelopes(ctx.userId, workspaceId, body.since) });
  } catch (error) {
    return jsonError(error);
  }
}
