import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { createTransactionBodySchema } from "@/src/core/schemas/ledger";
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
      cursor: url.searchParams.get("cursor") ?? undefined,
      categoryId: url.searchParams.get("categoryId") ?? undefined,
      accountId: url.searchParams.get("accountId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      type: (url.searchParams.get("type") as "expense" | "income" | "transfer") || undefined,
      recurringOnly: url.searchParams.get("recurring") === "1",
      limit: url.searchParams.get("limit")
        ? Number.parseInt(url.searchParams.get("limit")!, 10)
        : undefined,
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
    const body = createTransactionBodySchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const transaction = await sync.createTransaction({
      workspaceId,
      type: body.type,
      amountMinor: parseMajorToMinor(body.amountMajor),
      currency: body.currency,
      categoryId: body.categoryId ?? null,
      accountId: body.accountId ?? null,
      date: body.date,
      note: body.note ?? null,
      receiptUrl: body.receiptUrl ?? null,
      receiptStorageKey: body.receiptStorageKey ?? null,
      recurrence: body.recurrence ?? null,
    });
    return jsonOk({ transaction }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
