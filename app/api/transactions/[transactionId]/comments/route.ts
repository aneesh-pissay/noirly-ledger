import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { commentBodySchema } from "@/src/core/schemas/ledger";
import { addComment } from "@/src/server/transaction-activity";

/** Comments on a transaction; anyone in the workspace can add one. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const body = commentBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await addComment(ctx.userId, transactionId, body.body);
    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
