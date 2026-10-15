import { ApiError, getLedgerProvider, jsonError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { readReceipt, receiptWorkspaceId } from "@/src/server/storage/receipts";
import { requireMembershipRole } from "@/src/server/workspace/members";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  try {
    const { ctx } = await getLedgerProvider();
    const { key } = await params;
    const joined = key.join("/");
    const workspaceId = receiptWorkspaceId(joined);
    if (!workspaceId) throw new ApiError(404, "not_found", "Receipt not found");
    // Only members of the receipt's workspace may see it. Anyone else gets the
    // same 404 as a missing file, so keys can't be probed.
    await withDb(() => requireMembershipRole(ctx.userId, workspaceId)).catch(() => {
      throw new ApiError(404, "not_found", "Receipt not found");
    });
    const { bytes, mime } = await readReceipt(joined);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        // A PDF or image, opened directly, runs no script on this origin.
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
