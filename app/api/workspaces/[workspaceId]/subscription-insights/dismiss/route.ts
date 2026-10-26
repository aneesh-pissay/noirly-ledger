import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { insightIdBodySchema } from "@/src/core/schemas/ledger";
import { dismissInsight } from "@/src/server/subscription-insights";

/** Sets a subscription insight aside. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { id } = insightIdBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await dismissInsight(ctx.userId, workspaceId, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
