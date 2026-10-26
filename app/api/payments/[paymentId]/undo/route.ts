import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { undoPayment } from "@/src/server/payments";

/** Takes back marking a payment paid. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const { paymentId } = await params;
    await assertObjectId(paymentId, "paymentId");
    const { ctx, sync } = await getLedgerProvider();
    return jsonOk({ payment: await undoPayment(sync, ctx.userId, paymentId) });
  } catch (error) {
    return jsonError(error);
  }
}
