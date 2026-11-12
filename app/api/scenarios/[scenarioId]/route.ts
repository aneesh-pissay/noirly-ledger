import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { scenarioBodySchema } from "@/src/core/schemas/ledger";
import { deleteScenario, updateScenario } from "@/src/server/scenarios";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ scenarioId: string }> },
) {
  try {
    const { scenarioId } = await params;
    await assertObjectId(scenarioId, "scenarioId");
    const body = scenarioBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ scenario: await updateScenario(ctx.userId, scenarioId, body) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ scenarioId: string }> },
) {
  try {
    const { scenarioId } = await params;
    await assertObjectId(scenarioId, "scenarioId");
    const { ctx } = await getLedgerProvider();
    await deleteScenario(ctx.userId, scenarioId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
