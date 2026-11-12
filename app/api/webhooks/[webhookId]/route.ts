import { getLedgerProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { webhookPatchSchema } from "@/src/core/schemas/ledger";
import { deleteWebhook, updateWebhook } from "@/src/server/webhooks";

type Params = { params: Promise<{ webhookId: string }> };

/** Changes a webhook's URL or events, or turns it off or on. Needs you signed in. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { webhookId } = await params;
    const body = webhookPatchSchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Changing a webhook");
    return jsonOk({ webhook: await updateWebhook(ctx.userId, webhookId, body) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { webhookId } = await params;
    const { ctx } = await getLedgerProvider();
    await deleteWebhook(ctx.userId, webhookId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
