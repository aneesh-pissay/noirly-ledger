import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listBudgetRevisions } from "@/src/server/budget-revisions";

/** The workspace's latest budget changes (?budgetId= for one budget's). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const budgetId = new URL(request.url).searchParams.get("budgetId") ?? undefined;
    const { ctx } = await getLedgerProvider();
    return jsonOk({ revisions: await listBudgetRevisions(ctx.userId, workspaceId, budgetId) });
  } catch (error) {
    return jsonError(error);
  }
}
