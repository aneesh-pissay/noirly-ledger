import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { scenarioBodySchema } from "@/src/core/schemas/ledger";
import { createScenario, listScenarios } from "@/src/server/scenarios";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ scenarios: await listScenarios(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = scenarioBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ scenario: await createScenario(ctx.userId, workspaceId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
