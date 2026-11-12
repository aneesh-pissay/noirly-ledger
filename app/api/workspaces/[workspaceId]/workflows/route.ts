import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { workflowBodySchema } from "@/src/core/schemas/ledger";
import { createWorkflow, listWorkflows } from "@/src/server/workflows";

/** The workspace's workflows, each with its latest runs. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listWorkflows(ctx.userId, workspaceId));
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
    const body = workflowBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ workflow: await createWorkflow(ctx.userId, workspaceId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
