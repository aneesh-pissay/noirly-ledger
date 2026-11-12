import { getLedgerProvider, jsonError, jsonOk, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { deleteWorkspaceBodySchema } from "@/src/core/schemas/ledger";
import { deleteWorkspace } from "@/src/server/retention";

/** Deletes a shared workspace and everything in it: its owner, signed in, typing its name as `confirmName`. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = deleteWorkspaceBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Deleting a workspace");
    return jsonOk(await deleteWorkspace(ctx.userId, workspaceId, body.confirmName));
  } catch (error) {
    return jsonError(error);
  }
}
