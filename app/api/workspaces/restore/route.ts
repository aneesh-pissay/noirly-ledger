import { ApiError, getLedgerProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { restoreUpload } from "@/src/server/backups";
import { MAX_RESTORE_BYTES } from "@/src/core/backup";

/** Restores an uploaded export (.json) or backup (.json.gz), sent as the raw body, as a new workspace. */
export async function POST(request: Request) {
  try {
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Restoring a backup");
    if (Number(request.headers.get("content-length") ?? 0) > MAX_RESTORE_BYTES) {
      throw new ApiError(413, "too_large", `Files go up to ${MAX_RESTORE_BYTES / 1_048_576} MB`);
    }
    const body = Buffer.from(await request.arrayBuffer());
    return jsonOk({ restored: await restoreUpload(ctx.userId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
