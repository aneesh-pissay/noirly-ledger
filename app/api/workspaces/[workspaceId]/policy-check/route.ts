import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { policyCheckBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { checkExpense } from "@/src/server/spending-policies";

/** What the spending policies say about an expense being filled in. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = policyCheckBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(await checkExpense(ctx.userId, workspaceId, {
      budgetPoolId: body.budgetPoolId,
      amountMinor: parseMajorToMinor(body.amountMajor),
      currency: body.currency,
      date: body.date,
      categoryId: body.categoryId ?? null,
      merchant: body.merchant ?? null,
      hasReceipt: body.hasReceipt,
    }));
  } catch (error) {
    return jsonError(error);
  }
}
