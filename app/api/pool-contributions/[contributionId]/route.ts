import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { removeContribution } from "@/src/server/pool-contributions";

/** Takes a contribution out; it stays on record, marked removed. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ contributionId: string }> },
) {
  try {
    const { contributionId } = await params;
    await assertObjectId(contributionId, "contributionId");
    const { ctx } = await getLedgerProvider();
    await removeContribution(ctx.userId, contributionId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
