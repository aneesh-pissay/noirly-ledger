import type { z } from "zod";
import { parseMajorToMinor } from "@/src/core/money";
import type { createTransactionBodySchema } from "@/src/core/schemas/ledger";
import type { CreateTransactionInput } from "@/src/core/sync/types";

/** A create-transaction request body as the provider's input: major amounts become minor units. */
export function createInputFromBody(workspaceId: string, body: z.infer<typeof createTransactionBodySchema>): CreateTransactionInput {
  return {
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
  };
}
