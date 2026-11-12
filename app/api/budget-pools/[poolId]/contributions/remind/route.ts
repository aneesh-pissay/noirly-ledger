import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { remindContributors } from "@/src/server/pool-contributions";

/** Tells everyone short of their share what they still owe. Pool managers only. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> },
) {
  try {
    const { poolId } = await params;
    await assertObjectId(poolId, "poolId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await remindContributors(ctx.userId, poolId));
  } catch (error) {
    return jsonError(error);
  }
}
