import { ApiError, getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { getGstSummary } from "@/src/server/gst";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GST paid and collected between ?from= and ?to= (YYYY-MM-DD), by currency and rate. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!DAY.test(from) || !DAY.test(to) || from > to) throw new ApiError(400, "invalid_request", "Give from and to dates, from first");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ summary: await getGstSummary(ctx.userId, workspaceId, from, to) });
  } catch (error) {
    return jsonError(error);
  }
}
