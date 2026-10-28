import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { pledgeBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { setPledge } from "@/src/server/goal-forecasts";

/** What the person means to put into a shared goal each month; 0 takes their pledge back. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  try {
    const { goalId } = await params;
    await assertObjectId(goalId, "goalId");
    const body = pledgeBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(await setPledge(ctx.userId, goalId, Math.abs(parseMajorToMinor(body.monthlyMajor))));
  } catch (error) {
    return jsonError(error);
  }
}
