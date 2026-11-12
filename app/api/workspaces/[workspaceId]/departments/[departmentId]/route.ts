import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { departmentPatchSchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { deleteDepartment, updateDepartment } from "@/src/server/departments";

/** Changes a department or team: name, parent, budget, members, or archives it. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; departmentId: string }> },
) {
  try {
    const { workspaceId, departmentId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(departmentId, "departmentId");
    const { budgetMajor, ...body } = departmentPatchSchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const department = await updateDepartment(ctx.userId, workspaceId, departmentId, {
      ...body,
      ...(budgetMajor !== undefined ? { budgetMinor: budgetMajor === null ? null : parseMajorToMinor(budgetMajor) } : {}),
    });
    return jsonOk({ department });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes one with no spending and no teams; otherwise archive it. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; departmentId: string }> },
) {
  try {
    const { workspaceId, departmentId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(departmentId, "departmentId");
    const { ctx } = await getLedgerProvider();
    await deleteDepartment(ctx.userId, workspaceId, departmentId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
