import { getLedgerProvider, jsonError, jsonOk, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { webhookBodySchema } from "@/src/core/schemas/ledger";
import { createWebhook, listWebhooks } from "@/src/server/webhooks";

type Params = { params: Promise<{ workspaceId: string }> };

/** The workspace's webhooks (managers only). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ webhooks: await listWebhooks(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Adds one; its signing secret comes back this once. Needs you signed in. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = webhookBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Adding a webhook");
    return jsonOk(await createWebhook(ctx.userId, workspaceId, body), 201);
  } catch (error) {
    return jsonError(error);
  }
}
