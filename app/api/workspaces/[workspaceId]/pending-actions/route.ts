import { getLedgerProvider, jsonError, jsonOk, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { dualControlBodySchema } from "@/src/core/schemas/ledger";
import { listPendingActions, setDualControl } from "@/src/server/dual-control";

type Params = { params: Promise<{ workspaceId: string }> };

/** Whether sensitive changes take a second owner here, and the requests waiting or decided. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listPendingActions(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Turns two-person approval on or off (off takes a second owner). Needs you signed in. */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = dualControlBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Changing two-person approval");
    return jsonOk(await setDualControl(ctx.userId, workspaceId, body.enabled));
  } catch (error) {
    return jsonError(error);
  }
}
