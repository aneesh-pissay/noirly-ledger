import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { reconcileAccountBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { reconcileAccount } from "@/src/server/accounts";

/** Reconciles the account to a statement: its balance and the day it runs through. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    await assertObjectId(accountId, "accountId");
    const body = reconcileAccountBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const result = await reconcileAccount(ctx.userId, accountId, {
      statementMinor: parseMajorToMinor(body.statementMajor),
      through: body.through,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
