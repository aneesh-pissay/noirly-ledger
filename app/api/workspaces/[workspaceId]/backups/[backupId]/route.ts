import { getLedgerProvider, jsonError, assertObjectId } from "@/src/server/api/http";
import { readBackup } from "@/src/server/backups";
import { fileSlug } from "@/src/core/backup";

/** Downloads a backup as gzipped JSON. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; backupId: string }> },
) {
  try {
    const { workspaceId, backupId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(backupId, "backupId");
    const { ctx } = await getLedgerProvider();
    const { body, createdAt, name } = await readBackup(ctx.userId, workspaceId, backupId);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="ledger-${fileSlug(name)}-backup-${createdAt.toISOString().slice(0, 10)}.json.gz"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
