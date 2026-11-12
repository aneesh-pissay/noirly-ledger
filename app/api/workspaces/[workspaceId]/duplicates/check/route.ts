import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { duplicateCheckBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { normalizeUpiRef } from "@/src/core/upi";
import { checkDuplicates } from "@/src/server/duplicates";

/** Transactions already recorded that one being entered looks like. Saves nothing. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = duplicateCheckBodySchema.parse(await request.json());
    let upiRef: string | null = null;
    try {
      upiRef = normalizeUpiRef(body.upiRef ?? null);
    } catch {
      // Half-typed; the form says what's wrong with it on save.
    }
    const { ctx } = await getLedgerProvider();
    return jsonOk(
      await checkDuplicates(ctx.userId, workspaceId, {
        type: body.type,
        amountMinor: Math.abs(parseMajorToMinor(body.amountMajor)),
        currency: body.currency,
        date: body.date,
        accountId: body.accountId ?? null,
        text: body.text ?? "",
        upiRef,
        exceptId: body.exceptId ?? null,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
