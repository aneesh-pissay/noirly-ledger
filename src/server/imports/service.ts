import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel, ImportBatch, Transaction as TransactionModel, Workspace } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { bulkCreateTransactions } from "@/src/server/bulk";
import { readXlsx } from "@/src/server/imports/xlsx";
import { bankFormat, detectBankFormat, findBankFormat } from "@/src/core/bank-formats";
import { guessMapping, mapRows, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseCsv, type ColumnMapping, type ImportRow } from "@/src/core/imports";
import type { CreateTransactionInput, ImportBatchSummary, ImportPreview, LedgerSyncProvider } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

export type StatementFile = { name: string; bytes: Buffer };

/** The statement's rows of cells: an .xlsx workbook's first sheet, or CSV text. */
export function readStatement(file: StatementFile): string[][] {
  if (file.bytes.length > MAX_IMPORT_BYTES) throw new ApiError(400, "too_large", "Statements can be up to 5 MB");
  const isZip = file.bytes.subarray(0, 2).toString("latin1") === "PK";
  let rows: string[][];
  try {
    rows = isZip || /\.xlsx$/i.test(file.name) ? readXlsx(file.bytes) : parseCsv(file.bytes.toString("utf8"));
  } catch (error) {
    throw new ApiError(400, "unreadable", error instanceof Error ? error.message : "Couldn't read that file");
  }
  if (!rows.length) throw new ApiError(400, "empty", "That file has no rows");
  if (rows.length > MAX_IMPORT_ROWS + 30) throw new ApiError(400, "too_many_rows", `A statement can have up to ${MAX_IMPORT_ROWS} rows; split it into smaller files`);
  return rows;
}

/**
 * Rows that look like ones already recorded: the same day and amount (in the
 * chosen account, when there is one), or the same UPI reference.
 */
async function markDuplicates(workspaceId: Types.ObjectId, accountId: string | null, rows: ImportRow[]) {
  const dated = rows.filter((r) => r.date && r.amountMinor);
  if (!dated.length) return new Set<number>();
  const days = dated.map((r) => r.date!).sort();
  const refs = rows.map((r) => r.reference?.replace(/[\s-]/g, "")).filter((r): r is string => Boolean(r && /^\d{12}$/.test(r)));
  const existing = await TransactionModel.find({
    workspaceId,
    deletedAt: null,
    $or: [
      { date: { $gte: new Date(`${days[0]}T00:00:00.000Z`), $lte: new Date(`${days.at(-1)}T23:59:59.999Z`) }, ...(accountId ? { accountId: oid(accountId) } : {}) },
      ...(refs.length ? [{ upiRef: { $in: refs } }] : []),
    ],
  })
    .select("date amountMinor type upiRef")
    .lean();
  const seen = new Set(existing.map((t) => `${t.date.toISOString().slice(0, 10)}|${t.type === "income" || t.type === "refund" ? t.amountMinor : -t.amountMinor}`));
  const usedRefs = new Set(existing.map((t) => t.upiRef).filter(Boolean));
  const duplicates = new Set<number>();
  for (const row of rows) {
    const ref = row.reference?.replace(/[\s-]/g, "");
    if ((row.date && row.amountMinor && seen.has(`${row.date}|${row.amountMinor}`)) || (ref && usedRefs.has(ref))) duplicates.add(row.line);
  }
  return duplicates;
}

/** What importing the file would add, row by row, with problems and likely duplicates marked. Saves nothing. */
/**
 * The columns to read a statement by when none were picked: the chosen
 * bank's layout, or with "auto" the layout of whichever bank it looks like,
 * else a guess from the column names ("none" goes straight to the guess).
 */
export function startingMapping(rows: string[][], bank: string | null | undefined): ColumnMapping {
  if (bank && bank !== "auto" && bank !== "none") {
    const format = bankFormat(bank);
    if (!format) throw new ApiError(400, "invalid_request", "Unknown bank format");
    const mapping = findBankFormat(rows, format);
    if (!mapping) throw new ApiError(400, "format_mismatch", `This doesn't look like a ${format.name} statement: its columns weren't found`);
    return mapping;
  }
  if (bank !== "none") {
    const detected = detectBankFormat(rows);
    if (detected) return detected.mapping;
  }
  return { ...guessMapping(rows), bank: null };
}

export function previewImport(userId: string, workspaceId: string, file: StatementFile, options: { mapping?: ColumnMapping | null; bank?: string | null; accountId?: string | null }): Promise<ImportPreview> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const rows = readStatement(file);
    const mapping = options.mapping ?? startingMapping(rows, options.bank);
    const parsed = mapRows(rows, mapping);
    const duplicates = await markDuplicates(oid(workspaceId), options.accountId ?? null, parsed);
    return {
      fileName: file.name,
      headers: rows[mapping.headerRow] ?? [],
      preamble: rows.slice(0, mapping.headerRow).map((r) => r.join(" ").trim()).filter(Boolean),
      mapping,
      rows: parsed.map((row) => ({ ...row, duplicate: duplicates.has(row.line) })),
    };
  });
}

/**
 * Adds the file's good rows, leaving out the lines asked to be skipped, as
 * one batch: all of them or none. Money out becomes expenses, money in
 * income, in the chosen account's currency (or the workspace's).
 */
export async function commitImport(
  sync: LedgerSyncProvider,
  userId: string,
  workspaceId: string,
  file: StatementFile,
  options: { mapping: ColumnMapping; accountId: string | null; categoryId: string | null; skipLines: number[] },
) {
  const preview = await previewImport(userId, workspaceId, file, { mapping: options.mapping, accountId: options.accountId });
  const skip = new Set(options.skipLines);
  const chosen = preview.rows.filter((row) => !row.error && !skip.has(row.line));
  if (!chosen.length) throw new ApiError(400, "invalid_request", "There's nothing to import: every row has a problem or is skipped");
  const currency = await withDb(async () => {
    if (options.accountId) {
      const account = await AccountModel.findOne({ _id: oid(options.accountId), workspaceId: oid(workspaceId) }).select("currency").lean();
      if (!account) throw new ApiError(400, "invalid_request", "That account isn't in this workspace");
      return account.currency;
    }
    const workspace = await Workspace.findById(oid(workspaceId)).select("baseCurrency").lean();
    return workspace!.baseCurrency;
  });
  // A UPI reference already recorded would stop the whole import, so it's left off that row (the row is a likely duplicate anyway).
  const refs = chosen.map((r) => r.reference?.replace(/[\s-]/g, "")).filter((r): r is string => Boolean(r && /^\d{12}$/.test(r)));
  const used = new Set(
    (await withDb(() => TransactionModel.find({ workspaceId: oid(workspaceId), deletedAt: null, upiRef: { $in: refs } }).select("upiRef").lean())).map((t) => t.upiRef),
  );
  const inFile = new Set<string>();
  const inputs: CreateTransactionInput[] = chosen.map((row) => {
    const ref = row.reference?.replace(/[\s-]/g, "") ?? "";
    const upiRef = /^\d{12}$/.test(ref) && !used.has(ref) && !inFile.has(ref) ? ref : null;
    if (upiRef) inFile.add(upiRef);
    return {
      workspaceId,
      type: row.amountMinor! < 0 ? "expense" : "income",
      amountMinor: Math.abs(row.amountMinor!),
      currency,
      categoryId: options.categoryId,
      accountId: options.accountId,
      date: row.date!,
      note: row.description || null,
      upiRef,
      clearing: "cleared",
    };
  });
  const batch = await withDb(() =>
    ImportBatch.create({
      workspaceId: oid(workspaceId),
      fileName: file.name.slice(0, 200),
      accountId: options.accountId ? oid(options.accountId) : null,
      rowCount: preview.rows.length,
      createdCount: inputs.length,
      skippedCount: preview.rows.length - inputs.length,
      createdById: oid(userId),
    }),
  );
  let created;
  try {
    created = await bulkCreateTransactions(sync, inputs);
  } catch (error) {
    await withDb(() => batch.deleteOne());
    throw error;
  }
  await withDb(() => TransactionModel.updateMany({ _id: { $in: created.map((t) => new Types.ObjectId(t.id)) } }, { $set: { importBatchId: batch._id } }));
  return withDb(() => summarize(batch));
}

async function summarize(batch: { _id: Types.ObjectId; fileName: string; accountId?: Types.ObjectId | null; rowCount: number; createdCount: number; skippedCount: number; rolledBackAt?: Date | null; createdAt: Date }): Promise<ImportBatchSummary> {
  const live = await TransactionModel.countDocuments({ importBatchId: batch._id, deletedAt: null });
  return {
    id: String(batch._id),
    fileName: batch.fileName,
    accountId: batch.accountId ? String(batch.accountId) : null,
    rowCount: batch.rowCount,
    createdCount: batch.createdCount,
    skippedCount: batch.skippedCount,
    liveCount: live,
    rolledBack: Boolean(batch.rolledBackAt),
    createdAt: batch.createdAt.toISOString(),
  };
}

export function listImports(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const batches = await ImportBatch.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: -1 }).limit(20).lean();
    return Promise.all(batches.map(summarize));
  });
}

/**
 * Undoes an import: every transaction it added that's still there is
 * deleted. If any has been reconciled since, nothing is undone, so the books
 * aren't left half-changed.
 */
export async function rollbackImport(sync: LedgerSyncProvider, userId: string, batchId: string) {
  const batch = await withDb(() => ImportBatch.findById(oid(batchId)));
  if (!batch) throw new ApiError(404, "not_found", "Import not found");
  await withDb(() => requireMembershipRole(userId, String(batch.workspaceId)));
  if (batch.rolledBackAt) throw new ApiError(409, "already_undone", "This import was already undone");
  const live = await withDb(() => TransactionModel.find({ importBatchId: batch._id, deletedAt: null }).select("_id clearing").lean());
  const reconciled = live.filter((t) => t.clearing === "reconciled").length;
  if (reconciled) throw new ApiError(409, "reconciled", `${reconciled} of its transactions are reconciled. Mark them cleared first to undo the import.`);
  for (const t of live) await sync.deleteTransaction(String(t._id));
  batch.rolledBackAt = new Date();
  await withDb(() => batch.save());
  return withDb(() => summarize(batch));
}
