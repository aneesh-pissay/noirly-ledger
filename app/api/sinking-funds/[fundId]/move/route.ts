import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { fundMoveBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { moveFundMoney } from "@/src/server/sinking-funds";

/** Sets money aside in a fund, or takes some out. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ fundId: string }> },
) {
  try {
    const { fundId } = await params;
    await assertObjectId(fundId, "fundId");
    const body = fundMoveBodySchema.parse(await request.json());
    const amount = Math.abs(parseMajorToMinor(body.amountMajor));
    const { ctx } = await getLedgerProvider();
    return jsonOk({ fund: await moveFundMoney(ctx.userId, fundId, body.direction === "in" ? amount : -amount) });
  } catch (error) {
    return jsonError(error);
  }
}
