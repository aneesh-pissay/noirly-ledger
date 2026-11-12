import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { transactionRuleBodySchema } from "@/src/core/schemas/ledger";
import { deleteRule, ruleInputFromBody, updateRule } from "@/src/server/transaction-rules";

/** Replaces a rule. Transactions it already filled in keep what they got. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; ruleId: string }> },
) {
  try {
    const { workspaceId, ruleId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(ruleId, "ruleId");
    const body = transactionRuleBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ rule: await updateRule(ctx.userId, workspaceId, ruleId, ruleInputFromBody(body)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; ruleId: string }> },
) {
  try {
    const { workspaceId, ruleId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(ruleId, "ruleId");
    const { ctx } = await getLedgerProvider();
    await deleteRule(ctx.userId, workspaceId, ruleId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
