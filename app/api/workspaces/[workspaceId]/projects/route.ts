import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { createProjectBodySchema } from "@/src/core/schemas/ledger";
import { createProject, listProjects } from "@/src/server/projects";

/** The workspace's projects with their totals. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ projects: await listProjects(ctx.userId, workspaceId) });
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
    const body = createProjectBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ project: await createProject(ctx.userId, workspaceId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
