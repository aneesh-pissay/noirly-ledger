import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { getActivity } from "@/src/server/transaction-activity";

/** A transaction's files, comments and change history. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ activity: await getActivity(ctx.userId, transactionId) });
  } catch (error) {
    return jsonError(error);
  }
}
