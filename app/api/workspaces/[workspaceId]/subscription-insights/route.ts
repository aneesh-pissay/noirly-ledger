import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listSubscriptionInsights } from "@/src/server/subscription-insights";

/** Price rises, subscriptions doing the same job, and tracked ones to check on before their next charge. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listSubscriptionInsights(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
