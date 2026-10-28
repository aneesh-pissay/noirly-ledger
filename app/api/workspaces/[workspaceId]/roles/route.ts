import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { customRoleBodySchema } from "@/src/core/schemas/ledger";
import { createRole, listRoles } from "@/src/server/workspace/roles";

/** The workspace's own roles, and what each may do. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listRoles(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Defines a role: a name and its permissions. Owners only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = customRoleBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ role: await createRole(ctx.userId, workspaceId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
