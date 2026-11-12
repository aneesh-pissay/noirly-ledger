import { getLedgerProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { redeliver } from "@/src/server/webhooks";

/** Sends a delivery again now. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ webhookId: string; deliveryId: string }> },
) {
  try {
    const { webhookId, deliveryId } = await params;
    const { ctx } = await getLedgerProvider();
    return jsonOk({ delivery: await redeliver(ctx.userId, webhookId, deliveryId) });
  } catch (error) {
    return jsonError(error);
  }
}
