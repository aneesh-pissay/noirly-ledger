import { getLedgerProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { rotateWebhookSecret } from "@/src/server/webhooks";

/** A new signing secret, shown this once; the old one stops signing at once. Needs you signed in. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ webhookId: string }> },
) {
  try {
    const { webhookId } = await params;
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Rotating a webhook's secret");
    return jsonOk(await rotateWebhookSecret(ctx.userId, webhookId));
  } catch (error) {
    return jsonError(error);
  }
}
