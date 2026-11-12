import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { poolRulesBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { updatePoolRules } from "@/src/server/pool-rules";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ poolId: string }> },
) {
  try {
    const { poolId } = await params;
    await assertObjectId(poolId, "poolId");
    const { sync } = await getLedgerProvider();
    const pool = await sync.getBudgetPool(poolId);
    return jsonOk({ pool });
  } catch (error) {
    return jsonError(error);
  }
}

/** Sets the pool's own approvers, auto-approval and member limits. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> },
) {
  try {
    const { poolId } = await params;
    await assertObjectId(poolId, "poolId");
    const body = poolRulesBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const pool = await updatePoolRules(ctx.userId, poolId, {
      approverIds: body.approverIds,
      autoApproveUpToMinor: body.autoApproveUpToMajor ? parseMajorToMinor(body.autoApproveUpToMajor) : null,
      memberLimitMinor: body.memberLimitMajor ? parseMajorToMinor(body.memberLimitMajor) : null,
      memberLimits: body.memberLimits.map((l) => ({ userId: l.userId, limitMinor: parseMajorToMinor(l.limitMajor) })),
      memberLimitPeriod: body.memberLimitPeriod,
    });
    return jsonOk({ pool });
  } catch (error) {
    return jsonError(error);
  }
}
