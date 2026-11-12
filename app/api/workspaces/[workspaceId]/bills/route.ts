import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { getBillCalendar } from "@/src/server/bills";

/** A month of bills and subscriptions (?month=YYYY-MM, this month if left out): what's paid, due and still to come. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const { ctx } = await getLedgerProvider();
    return jsonOk(await getBillCalendar(ctx.userId, workspaceId, month));
  } catch (error) {
    return jsonError(error);
  }
}
