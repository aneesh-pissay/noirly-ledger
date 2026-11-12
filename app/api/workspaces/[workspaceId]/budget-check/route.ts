import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { budgetCheckBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { checkBudgetImpact } from "@/src/server/budget-check";

/** What an expense being entered would do to its budgets. Saves nothing. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = budgetCheckBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(
      await checkBudgetImpact(ctx.userId, workspaceId, {
        lines: body.lines.map((line) => ({ categoryId: line.categoryId, amountMinor: parseMajorToMinor(line.amountMajor) })),
        currency: body.currency,
        date: body.date,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
