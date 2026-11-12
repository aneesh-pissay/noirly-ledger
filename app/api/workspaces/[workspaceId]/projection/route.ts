import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { getProjection } from "@/src/server/projection";

/** Projected balances and available-to-spend over the next ?days=7–365 days (default 30). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const requested = Number(new URL(request.url).searchParams.get("days") ?? 30);
    const days = Number.isInteger(requested) ? Math.min(Math.max(requested, 7), 365) : 30;
    const { ctx } = await getLedgerProvider();
    return jsonOk({ projection: await getProjection(ctx.userId, workspaceId, days) });
  } catch (error) {
    return jsonError(error);
  }
}
