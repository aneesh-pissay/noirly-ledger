import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { notDuplicateBodySchema } from "@/src/core/schemas/ledger";
import { dismissDuplicate } from "@/src/server/duplicates";

/** Says this transaction and another are separate payments, though they look alike. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const body = notDuplicateBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await dismissDuplicate(ctx.userId, transactionId, body.otherId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
