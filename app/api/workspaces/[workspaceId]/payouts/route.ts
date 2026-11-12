import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { payoutBodySchema } from "@/src/core/schemas/ledger";
import { createPayout } from "@/src/server/reimbursements";

/** Records paying one person back for owed reimbursements. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = payoutBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ payout: await createPayout(ctx.userId, workspaceId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
