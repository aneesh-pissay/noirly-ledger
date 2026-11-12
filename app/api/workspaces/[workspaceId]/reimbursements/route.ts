import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { reimbursementQuerySchema } from "@/src/core/schemas/ledger";
import { listReimbursements } from "@/src/server/reimbursements";

/** Reimbursements and payouts: everyone's for those who pay back, otherwise the caller's own. `?status=` narrows. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const query = reimbursementQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listReimbursements(ctx.userId, workspaceId, query));
  } catch (error) {
    return jsonError(error);
  }
}
