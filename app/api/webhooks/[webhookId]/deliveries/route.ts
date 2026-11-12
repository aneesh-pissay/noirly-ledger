import { getLedgerProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { listDeliveries } from "@/src/server/webhooks";

/** The webhook's last 25 deliveries, newest first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ webhookId: string }> },
) {
  try {
    const { webhookId } = await params;
    const { ctx } = await getLedgerProvider();
    return jsonOk({ deliveries: await listDeliveries(ctx.userId, webhookId) });
  } catch (error) {
    return jsonError(error);
  }
}
