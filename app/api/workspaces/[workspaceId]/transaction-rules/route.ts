import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { approvalRuleOrderSchema, transactionRuleBodySchema } from "@/src/core/schemas/ledger";
import { createRule, listRules, reorderRules, ruleInputFromBody } from "@/src/server/transaction-rules";

/** The workspace's rules for incoming transactions, in the order they're tried. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listRules(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Adds a rule, tried after the others. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = transactionRuleBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ rule: await createRule(ctx.userId, workspaceId, ruleInputFromBody(body)) }, 201);
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
    return jsonOk(await reorderRules(ctx.userId, workspaceId, body.ids));
  } catch (error) {
    return jsonError(error);
  }
}
