import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { submitExpenseBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const url = new URL(request.url);
    const { sync } = await getLedgerProvider();
    const result = await sync.listTransactions({
      workspaceId,
      budgetPoolId: url.searchParams.get("poolId") ?? undefined,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = submitExpenseBodySchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const result = await sync.submitExpense({
      workspaceId,
      budgetPoolId: body.budgetPoolId,
      amountMinor: parseMajorToMinor(body.amountMajor),
      currency: body.currency,
      categoryId: body.categoryId ?? null,
      date: body.date,
      note: body.note ?? null,
      receiptUrl: body.receiptUrl ?? null,
      receiptStorageKey: body.receiptStorageKey ?? null,
      reimburse: body.reimburse ?? false,
      merchant: body.merchant ?? null,
      projectId: body.projectId ?? null,
      departmentId: body.departmentId,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
