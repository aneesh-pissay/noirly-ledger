import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { updateAccountBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { deleteAccount, updateAccount } from "@/src/server/accounts";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    await assertObjectId(accountId, "accountId");
    const body = updateAccountBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const account = await updateAccount(ctx.userId, accountId, {
      name: body.name,
      kind: body.kind,
      currency: body.currency,
      openingBalanceMinor: body.openingMajor !== undefined ? parseMajorToMinor(body.openingMajor) : undefined,
      openingDate: body.openingDate,
      institution: body.institution,
      archived: body.archived,
    });
    return jsonOk({ account });
  } catch (error) {
    return jsonError(error);
  }
}

/** Deletes an account with no transactions; one that has them must be archived. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    await assertObjectId(accountId, "accountId");
    const { ctx } = await getLedgerProvider();
    await deleteAccount(ctx.userId, accountId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
