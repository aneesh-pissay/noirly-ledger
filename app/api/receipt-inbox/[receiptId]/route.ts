import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { inboxReceiptPatchSchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { deleteInboxReceipt, updateInboxReceipt } from "@/src/server/receipt-inbox";

/** Corrects a receipt's date, amount, currency or shop, so it matches. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  try {
    const { receiptId } = await params;
    await assertObjectId(receiptId, "receiptId");
    const body = inboxReceiptPatchSchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await updateInboxReceipt(ctx.userId, receiptId, {
      date: body.date,
      amountMinor: body.amountMajor === undefined ? undefined : body.amountMajor === null ? null : Math.abs(parseMajorToMinor(body.amountMajor)),
      currency: body.currency,
      merchant: body.merchant,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  try {
    const { receiptId } = await params;
    await assertObjectId(receiptId, "receiptId");
    const { ctx } = await getLedgerProvider();
    await deleteInboxReceipt(ctx.userId, receiptId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
