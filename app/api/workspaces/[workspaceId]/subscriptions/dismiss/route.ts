import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { subscriptionKeyBodySchema } from "@/src/core/schemas/ledger";
import { dismissSubscription } from "@/src/server/subscriptions";

/** Sets spotted charges aside as not a subscription. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { key } = subscriptionKeyBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await dismissSubscription(ctx.userId, workspaceId, key);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
