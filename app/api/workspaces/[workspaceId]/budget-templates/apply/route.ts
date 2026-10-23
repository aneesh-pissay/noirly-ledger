import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { applyBudgetTemplateBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { applyBudgetTemplate } from "@/src/server/budget-templates";

/** Creates or updates a template's budgets; shares of income need the monthly income. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = applyBudgetTemplateBodySchema.parse(await request.json());
    const { ctx, sync } = await getLedgerProvider();
    const result = await applyBudgetTemplate(
      ctx.userId,
      workspaceId,
      body.templateId,
      body.monthlyIncomeMajor ? parseMajorToMinor(body.monthlyIncomeMajor) : null,
      (input) => sync.upsertBudget(input),
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
