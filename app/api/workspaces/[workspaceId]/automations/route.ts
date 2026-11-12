import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { automationBodySchema } from "@/src/core/schemas/ledger";
import { createAutomation, listAutomations } from "@/src/server/automations";

/** The workspace's automations: digests, budget refreshes and sweeps. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listAutomations(ctx.userId, workspaceId));
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
    const body = automationBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ automation: await createAutomation(ctx.userId, workspaceId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
