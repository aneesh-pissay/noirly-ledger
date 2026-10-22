import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { updateProjectBodySchema } from "@/src/core/schemas/ledger";
import { deleteProject, updateProject } from "@/src/server/projects";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const body = updateProjectBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ project: await updateProject(ctx.userId, projectId, body) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes a project with no transactions; one that has them must be archived. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await assertObjectId(projectId, "projectId");
    const { ctx } = await getLedgerProvider();
    await deleteProject(ctx.userId, projectId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
