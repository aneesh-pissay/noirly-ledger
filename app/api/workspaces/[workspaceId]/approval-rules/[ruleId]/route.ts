import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { approvalRuleBodySchema } from "@/src/core/schemas/ledger";
import { deleteApprovalRule, ruleInput, updateApprovalRule } from "@/src/server/approval-rules";

/** Replaces a rule's conditions and steps. Expenses already submitted keep their chain. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; ruleId: string }> },
) {
  try {
    const { workspaceId, ruleId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(ruleId, "ruleId");
    const body = approvalRuleBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ rule: await updateApprovalRule(ctx.userId, workspaceId, ruleId, ruleInput(body)) });
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
    await deleteApprovalRule(ctx.userId, workspaceId, ruleId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
