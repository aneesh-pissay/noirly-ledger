import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { updateTransactionBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const { sync } = await getLedgerProvider();
    const transaction = await sync.getTransaction(transactionId);
    return jsonOk({ transaction });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const body = updateTransactionBodySchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const transaction = await sync.updateTransaction(transactionId, {
      type: body.type,
      amountMinor: body.amountMajor ? parseMajorToMinor(body.amountMajor) : undefined,
      currency: body.currency,
      categoryId: body.categoryId,
      accountId: body.accountId,
      toAccountId: body.toAccountId,
      clearing: body.clearing,
      toAmountMinor: body.toAmountMajor === undefined ? undefined : body.toAmountMajor === null ? null : parseMajorToMinor(body.toAmountMajor),
      date: body.date,
      note: body.note,
      receiptUrl: body.receiptUrl,
      receiptStorageKey: body.receiptStorageKey,
      recurrence: body.recurrence,
    });
    return jsonOk({ transaction });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const { sync } = await getLedgerProvider();
    await sync.deleteTransaction(transactionId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
