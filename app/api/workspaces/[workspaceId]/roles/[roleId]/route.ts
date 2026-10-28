import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { customRolePatchSchema } from "@/src/core/schemas/ledger";
import { deleteRole, updateRole } from "@/src/server/workspace/roles";

/** Renames a role or changes its permissions. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; roleId: string }> },
) {
  try {
    const { workspaceId, roleId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(roleId, "roleId");
    const body = customRolePatchSchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ role: await updateRole(ctx.userId, workspaceId, roleId, body) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes a role; its members go back to their built-in role. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; roleId: string }> },
) {
  try {
    const { workspaceId, roleId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(roleId, "roleId");
    const { ctx } = await getLedgerProvider();
    await deleteRole(ctx.userId, workspaceId, roleId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
