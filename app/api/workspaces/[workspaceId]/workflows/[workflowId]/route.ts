import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { workflowBodySchema } from "@/src/core/schemas/ledger";
import { deleteWorkflow, updateWorkflow } from "@/src/server/workflows";

/** Replaces a workflow (turn it off with `enabled: false`). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; workflowId: string }> },
) {
  try {
    const { workspaceId, workflowId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(workflowId, "workflowId");
    const body = workflowBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ workflow: await updateWorkflow(ctx.userId, workspaceId, workflowId, body) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; workflowId: string }> },
) {
  try {
    const { workspaceId, workflowId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(workflowId, "workflowId");
    const { ctx } = await getLedgerProvider();
    await deleteWorkflow(ctx.userId, workspaceId, workflowId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
