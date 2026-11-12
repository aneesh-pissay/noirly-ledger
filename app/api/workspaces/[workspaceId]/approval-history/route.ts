import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { approvalHistoryQuerySchema } from "@/src/core/schemas/ledger";
import { listApprovalHistory } from "@/src/server/approval-history";

/** The approval history, newest first: `?approvalId=` for one expense, `?before=` for the next page. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const query = approvalHistoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listApprovalHistory(ctx.userId, workspaceId, query));
  } catch (error) {
    return jsonError(error);
  }
}
