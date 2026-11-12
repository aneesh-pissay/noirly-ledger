import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { poolContributionBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { addContribution, poolFunding } from "@/src/server/pool-contributions";

/** What's been put into the pool, by whom, against who's expected to put what in. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> },
) {
  try {
    const { poolId } = await params;
    await assertObjectId(poolId, "poolId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await poolFunding(ctx.userId, poolId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Records money put in: yours, or someone else's (pool managers). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> },
) {
  try {
    const { poolId } = await params;
    await assertObjectId(poolId, "poolId");
    const body = poolContributionBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const contribution = await addContribution(ctx.userId, poolId, {
      amountMinor: parseMajorToMinor(body.amountMajor),
      date: body.date,
      note: body.note ?? null,
      forUserId: body.forUserId ?? null,
    });
    return jsonOk({ contribution }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
