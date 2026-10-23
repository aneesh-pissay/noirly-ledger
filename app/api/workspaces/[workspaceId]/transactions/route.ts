import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { createTransactionBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import type { TransactionType } from "@/src/core/models/enums";
import { CLEARING_STATES, type Clearing } from "@/src/core/clearing";

/** An amount filter as minor units; anything unreadable is ignored. */
function minor(value: string | null) {
  if (!value?.trim()) return undefined;
  try {
    return parseMajorToMinor(value.trim());
  } catch {
    return undefined;
  }
}

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
      tag: url.searchParams.get("tag") ?? undefined,
      merchant: url.searchParams.get("merchant") ?? undefined,
      projectId: url.searchParams.get("projectId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      minAmountMinor: minor(url.searchParams.get("min")),
      maxAmountMinor: minor(url.searchParams.get("max")),
      clearing: (CLEARING_STATES as readonly string[]).includes(url.searchParams.get("clearing") ?? "") ? (url.searchParams.get("clearing") as Clearing) : undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      type: (url.searchParams.get("type") as TransactionType) || undefined,
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
      toAccountId: body.toAccountId ?? null,
      refundOfId: body.refundOfId ?? null,
      clearing: body.clearing,
      tags: body.tags,
      merchant: body.merchant,
      projectId: body.projectId ?? null,
      splits: body.splits ? body.splits.map((line) => ({ categoryId: line.categoryId, amountMinor: parseMajorToMinor(line.amountMajor), note: line.note ?? null })) : null,
      toAmountMinor: body.toAmountMajor ? parseMajorToMinor(body.toAmountMajor) : null,
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
