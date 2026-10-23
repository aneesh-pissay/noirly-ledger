import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { budgetMoveBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { moveBudgetMoney } from "@/src/server/budget-revisions";

/** Moves part of one budget's limit to another of the same period. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = budgetMoveBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(
      await moveBudgetMoney(ctx.userId, workspaceId, {
        fromBudgetId: body.fromBudgetId,
        toBudgetId: body.toBudgetId,
        amountMinor: parseMajorToMinor(body.amountMajor),
        note: body.note ?? null,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
