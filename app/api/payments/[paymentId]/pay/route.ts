import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { payBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { payPayment } from "@/src/server/payments";

/** Marks a payment paid: recording the expense, linking one already there, or just noting the day. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const { paymentId } = await params;
    await assertObjectId(paymentId, "paymentId");
    const body = payBodySchema.parse(await request.json());
    const { ctx, sync } = await getLedgerProvider();
    const input =
      body.how === "record"
        ? { how: "record" as const, paidOn: body.paidOn, accountId: body.accountId, amountMinor: body.amountMajor ? Math.abs(parseMajorToMinor(body.amountMajor)) : null }
        : body;
    return jsonOk(await payPayment(sync, ctx.userId, paymentId, input));
  } catch (error) {
    return jsonError(error);
  }
}
