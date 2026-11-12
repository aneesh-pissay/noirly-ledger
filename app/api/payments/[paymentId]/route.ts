import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { paymentPatchSchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { deletePayment, updatePayment } from "@/src/server/payments";

/** Changes a payment not paid yet. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const { paymentId } = await params;
    await assertObjectId(paymentId, "paymentId");
    const { amountMajor, ...rest } = paymentPatchSchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const payment = await updatePayment(ctx.userId, paymentId, { ...rest, ...(amountMajor === undefined ? {} : { amountMinor: Math.abs(parseMajorToMinor(amountMajor)) }) });
    return jsonOk({ payment });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes a payment; a paid one keeps the expense it was paid with. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const { paymentId } = await params;
    await assertObjectId(paymentId, "paymentId");
    const { ctx } = await getLedgerProvider();
    await deletePayment(ctx.userId, paymentId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
