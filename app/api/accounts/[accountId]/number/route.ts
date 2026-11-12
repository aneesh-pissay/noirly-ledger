import { getLedgerProvider, jsonError, assertObjectId, refuseAccessToken } from "@/src/server/api/http";
import { revealAccountNumber } from "@/src/server/accounts";

/** The whole account number, for those who manage accounts, signed in. Recorded in the audit history. A POST, so it's never cached or prefetched. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    await assertObjectId(accountId, "accountId");
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Showing an account number");
    const result = await revealAccountNumber(ctx.userId, accountId);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
