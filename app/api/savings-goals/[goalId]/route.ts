import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { contributeGoalBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  try {
    const { goalId } = await params;
    await assertObjectId(goalId, "goalId");
    const body = contributeGoalBodySchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const goal = await sync.contributeToGoal(goalId, parseMajorToMinor(body.amountMajor), body.date);
    return jsonOk({ goal });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  try {
    const { goalId } = await params;
    await assertObjectId(goalId, "goalId");
    const { sync } = await getLedgerProvider();
    await sync.deleteSavingsGoal(goalId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
