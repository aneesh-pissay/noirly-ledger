import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { subscriptionKeyBodySchema } from "@/src/core/schemas/ledger";
import { trackSubscription } from "@/src/server/subscriptions";

/** Tracks a spotted subscription as a recurring bill. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { key } = subscriptionKeyBodySchema.parse(await request.json());
    const { ctx, sync } = await getLedgerProvider();
    return jsonOk(await trackSubscription(sync, ctx.userId, workspaceId, key));
  } catch (error) {
    return jsonError(error);
  }
}
