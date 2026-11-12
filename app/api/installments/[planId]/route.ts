import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { deleteInstallmentPlan } from "@/src/server/installments";

/** Removes an EMI plan and all its payments. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const { planId } = await params;
    await assertObjectId(planId, "planId");
    const { ctx, sync } = await getLedgerProvider();
    await deleteInstallmentPlan(sync, ctx.userId, planId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
