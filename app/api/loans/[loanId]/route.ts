import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { deleteLoan } from "@/src/server/loans";

/** Removes a loan's schedule; EMIs already recorded stay as transactions. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ loanId: string }> },
) {
  try {
    const { loanId } = await params;
    await assertObjectId(loanId, "loanId");
    const { ctx } = await getLedgerProvider();
    await deleteLoan(ctx.userId, loanId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
