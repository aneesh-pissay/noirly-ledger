import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { matchReceiptBodySchema } from "@/src/core/schemas/ledger";
import { matchReceipt } from "@/src/server/receipt-inbox";

/** Attaches the receipt to the chosen transaction. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  try {
    const { receiptId } = await params;
    await assertObjectId(receiptId, "receiptId");
    const body = matchReceiptBodySchema.parse(await request.json());
    const { ctx, sync } = await getLedgerProvider();
    await matchReceipt(sync, ctx.userId, receiptId, body.transactionId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
