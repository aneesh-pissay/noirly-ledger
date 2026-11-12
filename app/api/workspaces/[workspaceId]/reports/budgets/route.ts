import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { reportQuerySchema } from "@/src/core/schemas/ledger";
import { budgetVsActualReport } from "@/src/server/reports";

/** Budgets against actual spending, in each budget's own periods overlapping `?from=&to=`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const query = reportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { ctx } = await getLedgerProvider();
    return jsonOk(await budgetVsActualReport(ctx.userId, workspaceId, query));
  } catch (error) {
    return jsonError(error);
  }
}
