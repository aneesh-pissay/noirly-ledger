import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { reportQuerySchema } from "@/src/core/schemas/ledger";
import { incomeExpenseReport } from "@/src/server/reports";

/** Income, spending net of refunds and what's left, per period: `?from=&to=&granularity=`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const query = reportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { ctx } = await getLedgerProvider();
    return jsonOk(await incomeExpenseReport(ctx.userId, workspaceId, query));
  } catch (error) {
    return jsonError(error);
  }
}
