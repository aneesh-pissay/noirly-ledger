import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { paymentMatches } from "@/src/server/payments";

/** Expenses already recorded that could be this payment. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const { paymentId } = await params;
    await assertObjectId(paymentId, "paymentId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await paymentMatches(ctx.userId, paymentId));
  } catch (error) {
    return jsonError(error);
  }
}
