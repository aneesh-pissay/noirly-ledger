import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { attachmentBodySchema } from "@/src/core/schemas/ledger";
import { addAttachment } from "@/src/server/transaction-activity";

/** Attaches a file uploaded through the workspace's receipt upload. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const body = attachmentBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await addAttachment(ctx.userId, transactionId, body);
    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
