import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { markStillUsed } from "@/src/server/subscription-insights";

/** Notes that a recurring subscription is still in use. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await markStillUsed(ctx.userId, transactionId));
  } catch (error) {
    return jsonError(error);
  }
}
