import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { paymentBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { createPayment, listPayments } from "@/src/server/payments";

/** Bills paid by hand: the ones still to pay (overdue first), then the recently paid. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listPayments(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = paymentBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const payment = await createPayment(ctx.userId, workspaceId, {
      name: body.name,
      amountMinor: Math.abs(parseMajorToMinor(body.amountMajor)),
      currency: body.currency,
      dueDate: body.dueDate,
      accountId: body.accountId ?? null,
      categoryId: body.categoryId ?? null,
      note: body.note ?? null,
      repeat: body.repeat ?? "none",
    });
    return jsonOk({ payment }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
