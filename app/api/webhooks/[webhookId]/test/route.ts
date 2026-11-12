import { getLedgerProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { sendTestEvent } from "@/src/server/webhooks";

/** Sends a `ping` now and answers with how it went. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ webhookId: string }> },
) {
  try {
    const { webhookId } = await params;
    const { ctx } = await getLedgerProvider();
    return jsonOk({ delivery: await sendTestEvent(ctx.userId, webhookId) });
  } catch (error) {
    return jsonError(error);
  }
}
