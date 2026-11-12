import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { sinkingFundPatchSchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { deleteSinkingFund, updateSinkingFund } from "@/src/server/sinking-funds";

/** Changes a fund's name, target, due date or how it repeats. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ fundId: string }> },
) {
  try {
    const { fundId } = await params;
    await assertObjectId(fundId, "fundId");
    const { targetMajor, ...rest } = sinkingFundPatchSchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const fund = await updateSinkingFund(ctx.userId, fundId, { ...rest, ...(targetMajor === undefined ? {} : { targetMinor: Math.abs(parseMajorToMinor(targetMajor)) }) });
    return jsonOk({ fund });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ fundId: string }> },
) {
  try {
    const { fundId } = await params;
    await assertObjectId(fundId, "fundId");
    const { ctx } = await getLedgerProvider();
    await deleteSinkingFund(ctx.userId, fundId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
