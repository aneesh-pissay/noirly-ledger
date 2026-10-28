import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { updateMemberBodySchema } from "@/src/core/schemas/ledger";
import { updateMemberRole } from "@/src/server/workspace/members";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getLedgerProvider();
    const members = await sync.listMembers(workspaceId);
    return jsonOk({ members });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = (await request.json()) as { userId?: string; role?: string; customRoleId?: string | null };
    const parsed = updateMemberBodySchema.parse({ role: body.role, customRoleId: body.customRoleId });
    if (!body.userId) throw new Error("userId is required");
    const { ctx } = await getLedgerProvider();
    const member = await updateMemberRole({
      actorId: ctx.userId,
      workspaceId,
      targetUserId: body.userId,
      role: parsed.role,
      customRoleId: parsed.customRoleId,
    });
    return jsonOk({ member });
  } catch (error) {
    return jsonError(error);
  }
}
