import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { createAccountBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { createAccount, listAccounts } from "@/src/server/accounts";

/** The workspace's accounts with their balances. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ accounts: await listAccounts(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createAccountBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const account = await createAccount(ctx.userId, workspaceId, {
      name: body.name,
      kind: body.kind,
      currency: body.currency,
      openingBalanceMinor: parseMajorToMinor(body.openingMajor),
      openingDate: body.openingDate,
      institution: body.institution ?? null,
    });
    return jsonOk({ account }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
