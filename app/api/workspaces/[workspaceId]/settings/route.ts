import { Types } from "mongoose";
import { ApiError, getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { workspaceSettingsBodySchema } from "@/src/core/schemas/ledger";
import { withDb } from "@/src/server/db/mongodb";
import { Workspace } from "@/src/server/models";
import { requireAction } from "@/src/server/workspace/members";
import { mapWorkspace } from "@/src/server/mappers";

/** Workspace-wide settings the owner sets: when the financial year starts, and what a shared workspace is for. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = workspaceSettingsBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const workspace = await withDb(async () => {
      await requireAction(ctx.userId, workspaceId, "workspace.manage");
      if (body.purpose) {
        const current = await Workspace.findById(new Types.ObjectId(workspaceId)).select("kind").lean();
        if (current?.kind === "personal") throw new ApiError(400, "invalid_request", "The personal workspace is always personal");
      }
      return Workspace.findByIdAndUpdate(new Types.ObjectId(workspaceId), { $set: body }, { new: true });
    });
    return jsonOk({ workspace: workspace ? mapWorkspace(workspace) : null });
  } catch (error) {
    return jsonError(error);
  }
}
