import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { automationBodySchema } from "@/src/core/schemas/ledger";
import { deleteAutomation, updateAutomation } from "@/src/server/automations";

/** Replaces an automation (pause it with `paused: true`). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; automationId: string }> },
) {
  try {
    const { workspaceId, automationId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(automationId, "automationId");
    const body = automationBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ automation: await updateAutomation(ctx.userId, workspaceId, automationId, body) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; automationId: string }> },
) {
  try {
    const { workspaceId, automationId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(automationId, "automationId");
    const { ctx } = await getLedgerProvider();
    await deleteAutomation(ctx.userId, workspaceId, automationId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
