import { getLedgerProvider, jsonError, jsonOk, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { pendingDecisionBodySchema } from "@/src/core/schemas/ledger";
import { cancelPendingAction, decidePendingAction } from "@/src/server/dual-control";

type Params = { params: Promise<{ actionId: string }> };

/** A second owner agrees ({ decision: "approve" }) or turns it down ("reject"). Needs you signed in. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { actionId } = await params;
    await assertObjectId(actionId, "actionId");
    const body = pendingDecisionBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Agreeing to a sensitive change");
    return jsonOk(await decidePendingAction(ctx.userId, actionId, body.decision));
  } catch (error) {
    return jsonError(error);
  }
}

/** Whoever asked takes the request back. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { actionId } = await params;
    await assertObjectId(actionId, "actionId");
    const { ctx } = await getLedgerProvider();
    await cancelPendingAction(ctx.userId, actionId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
