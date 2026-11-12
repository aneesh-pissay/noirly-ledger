import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listGoalForecasts } from "@/src/server/goal-forecasts";

/** Each savings goal's milestones, recent pace and when it'll be reached at that pace. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listGoalForecasts(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}
