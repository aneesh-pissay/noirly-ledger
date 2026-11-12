import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { reportQuerySchema } from "@/src/core/schemas/ledger";
import { netWorthDebtReport } from "@/src/server/reports";

/** Net worth period by period, and debt paid down and added, over `?from=&to=&granularity=`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const query = reportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { ctx } = await getLedgerProvider();
    return jsonOk(await netWorthDebtReport(ctx.userId, workspaceId, query));
  } catch (error) {
    return jsonError(error);
  }
}
