import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { spendingPolicyBodySchema } from "@/src/core/schemas/ledger";
import { createPolicy, listPolicies, policyInput } from "@/src/server/spending-policies";

/** The workspace's spending policies. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listPolicies(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Adds a policy. Owners only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = spendingPolicyBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ policy: await createPolicy(ctx.userId, workspaceId, policyInput(body)) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
