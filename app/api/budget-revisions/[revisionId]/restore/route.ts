import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { restoreBudgetRevision } from "@/src/server/budget-revisions";

/** Puts a budget back to the limit this revision left it at. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ revisionId: string }> },
) {
  try {
    const { revisionId } = await params;
    await assertObjectId(revisionId, "revisionId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await restoreBudgetRevision(ctx.userId, revisionId));
  } catch (error) {
    return jsonError(error);
  }
}
