import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { fundSpentBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { spendFund } from "@/src/server/sinking-funds";

/** The expense was paid from the fund: a repeating fund starts its next round, a one-off one closes. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ fundId: string }> },
) {
  try {
    const { fundId } = await params;
    await assertObjectId(fundId, "fundId");
    const body = fundSpentBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(await spendFund(ctx.userId, fundId, body.spentMajor ? Math.abs(parseMajorToMinor(body.spentMajor)) : null));
  } catch (error) {
    return jsonError(error);
  }
}
