import { Types } from "mongoose";
import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { workspaceSettingsBodySchema } from "@/src/core/schemas/ledger";
import { withDb } from "@/src/server/db/mongodb";
import { Workspace } from "@/src/server/models";
import { requireAction } from "@/src/server/workspace/members";
import { mapWorkspace } from "@/src/server/mappers";

/** Workspace-wide settings the owner sets: when the financial year starts. */
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
      return Workspace.findByIdAndUpdate(
        new Types.ObjectId(workspaceId),
        { $set: { fiscalYearStartMonth: body.fiscalYearStartMonth } },
        { new: true },
      );
    });
    return jsonOk({ workspace: workspace ? mapWorkspace(workspace) : null });
  } catch (error) {
    return jsonError(error);
  }
}
