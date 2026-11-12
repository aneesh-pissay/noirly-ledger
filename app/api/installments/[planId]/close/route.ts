import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { closeInstallmentBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { closeInstallmentPlanEarly } from "@/src/server/installments";

/** Pays off the rest of an EMI plan today, with an optional foreclosure charge. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const { planId } = await params;
    await assertObjectId(planId, "planId");
    const body = closeInstallmentBodySchema.parse(await request.json());
    const { ctx, sync } = await getLedgerProvider();
    const plan = await closeInstallmentPlanEarly(sync, ctx.userId, planId, body.chargeMajor ? parseMajorToMinor(body.chargeMajor) : 0);
    return jsonOk({ plan });
  } catch (error) {
    return jsonError(error);
  }
}
