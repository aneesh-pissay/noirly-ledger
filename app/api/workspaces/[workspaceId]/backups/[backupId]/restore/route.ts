import { getLedgerProvider, jsonError, jsonOk, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { restoreBackup } from "@/src/server/backups";

/** Restores a stored backup as a new workspace; the one it's from is left as it is. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; backupId: string }> },
) {
  try {
    const { workspaceId, backupId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(backupId, "backupId");
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Restoring a backup");
    return jsonOk({ restored: await restoreBackup(ctx.userId, workspaceId, backupId) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
