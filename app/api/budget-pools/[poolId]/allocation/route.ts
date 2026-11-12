import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { poolAllocationBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { setAllocation } from "@/src/server/pool-contributions";

/** Sets who's expected to put what into the pool. Pool managers only. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> },
) {
  try {
    const { poolId } = await params;
    await assertObjectId(poolId, "poolId");
    const body = poolAllocationBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    // Percentages are kept in basis points; amounts in minor units; equal shares need no value.
    await setAllocation(ctx.userId, poolId, {
      mode: body.mode,
      targetMinor: body.targetMajor ? parseMajorToMinor(body.targetMajor) : null,
      shares: body.shares.map((s) => ({ userId: s.userId, value: body.mode === "equal" ? 0 : parseMajorToMinor(s.value) })),
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
