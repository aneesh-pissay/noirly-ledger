import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { FORECAST_BASES, getForecastBaseline, type ForecastBasis } from "@/src/server/forecast";

/** What a typical month looks like (?basis=recent|budgets), to forecast and try what-ifs against. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const requested = new URL(request.url).searchParams.get("basis") ?? "recent";
    const basis: ForecastBasis = (FORECAST_BASES as readonly string[]).includes(requested) ? (requested as ForecastBasis) : "recent";
    const { ctx } = await getLedgerProvider();
    return jsonOk({ forecast: await getForecastBaseline(ctx.userId, workspaceId, basis) });
  } catch (error) {
    return jsonError(error);
  }
}
