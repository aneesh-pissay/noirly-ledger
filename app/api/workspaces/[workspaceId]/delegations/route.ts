import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { delegationBodySchema } from "@/src/core/schemas/ledger";
import { createDelegation, listDelegations } from "@/src/server/approval-history";

/** Who is away and who approves for them, for delegations not yet over. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listDelegations(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Names someone to approve for the caller while they're away. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = delegationBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ delegation: await createDelegation(ctx.userId, workspaceId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
