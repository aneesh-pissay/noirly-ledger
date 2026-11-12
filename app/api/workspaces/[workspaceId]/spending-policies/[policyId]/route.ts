import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { spendingPolicyBodySchema } from "@/src/core/schemas/ledger";
import { deletePolicy, policyInput, updatePolicy } from "@/src/server/spending-policies";

/** Replaces a policy. Flags on expenses follow at once. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; policyId: string }> },
) {
  try {
    const { workspaceId, policyId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(policyId, "policyId");
    const body = spendingPolicyBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ policy: await updatePolicy(ctx.userId, workspaceId, policyId, policyInput(body)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; policyId: string }> },
) {
  try {
    const { workspaceId, policyId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(policyId, "policyId");
    const { ctx } = await getLedgerProvider();
    await deletePolicy(ctx.userId, workspaceId, policyId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
