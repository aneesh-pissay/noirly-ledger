import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { getNetWorth } from "@/src/server/net-worth";

/** Assets, liabilities and net worth in the base currency, with month-end history (?months=1–36, default 12). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const requested = Number(new URL(request.url).searchParams.get("months") ?? 12);
    const months = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 36) : 12;
    const { ctx } = await getLedgerProvider();
    return jsonOk({ netWorth: await getNetWorth(ctx.userId, workspaceId, months) });
  } catch (error) {
    return jsonError(error);
  }
}
