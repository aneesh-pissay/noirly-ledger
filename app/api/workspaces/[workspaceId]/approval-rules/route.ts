import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { approvalRuleBodySchema, approvalRuleOrderSchema } from "@/src/core/schemas/ledger";
import { createApprovalRule, listApprovalRules, reorderApprovalRules, ruleInput } from "@/src/server/approval-rules";

/** The workspace's approval rules, in the order they're tried. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listApprovalRules(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Adds a rule, tried after the others. Owners only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = approvalRuleBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ rule: await createApprovalRule(ctx.userId, workspaceId, ruleInput(body)) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

/** Puts the rules in a new order: `{ ids }`, every rule once. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = approvalRuleOrderSchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(await reorderApprovalRules(ctx.userId, workspaceId, body.ids));
  } catch (error) {
    return jsonError(error);
  }
}
