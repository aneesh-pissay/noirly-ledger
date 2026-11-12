import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { envelopeMoveBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { moveEnvelopeMoney } from "@/src/server/envelopes";

/** Moves money between envelopes, or to and from Ready to assign (a null side). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = envelopeMoveBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const envelopes = await moveEnvelopeMoney(ctx.userId, workspaceId, {
      fromCategoryId: body.fromCategoryId,
      toCategoryId: body.toCategoryId,
      amountMinor: parseMajorToMinor(body.amountMajor),
      note: body.note ?? null,
    });
    return jsonOk({ envelopes }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
