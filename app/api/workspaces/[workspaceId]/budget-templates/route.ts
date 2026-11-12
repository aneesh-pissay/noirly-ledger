import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { saveBudgetTemplateBodySchema } from "@/src/core/schemas/ledger";
import { listBudgetTemplates, saveBudgetTemplate } from "@/src/server/budget-templates";

/** Built-in budget templates and the workspace's saved ones. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ templates: await listBudgetTemplates(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Saves the workspace's current repeating budgets as a template. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = saveBudgetTemplateBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ template: await saveBudgetTemplate(ctx.userId, workspaceId, body.name) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
