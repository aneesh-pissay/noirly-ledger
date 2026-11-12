import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { reportQuerySchema } from "@/src/core/schemas/ledger";
import { insightsReport } from "@/src/server/reports";

/** Unusual spending, category variance and savings over `?from=&to=`, against the stretches before. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const query = reportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { ctx } = await getLedgerProvider();
    return jsonOk(await insightsReport(ctx.userId, workspaceId, query));
  } catch (error) {
    return jsonError(error);
  }
}
