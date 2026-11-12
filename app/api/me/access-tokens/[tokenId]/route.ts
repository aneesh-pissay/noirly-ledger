import { getLedgerProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { revokeAccessToken } from "@/src/server/access-tokens";

/** Revokes a token at once. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  try {
    const { tokenId } = await params;
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Managing access tokens");
    await revokeAccessToken(ctx.userId, tokenId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
