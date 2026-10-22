import { csvLine } from "@/src/core/reports/format";
import { formatMinorToMajor } from "@/src/core/money";

export type CsvTransactionRow = {
  date: string;
  type: string;
  amountMinor: number;
  currency: string;
  baseAmountMinor: number;
  category: string;
  pool: string;
  note: string;
  status: string;
  createdBy: string;
  merchant: string;
  /** Space-separated. */
  tags: string;
  project: string;
};

export const CSV_HEADER = csvLine([
  "date",
  "type",
  "amount",
  "currency",
  "base_amount",
  "category",
  "pool",
  "note",
  "status",
  "created_by",
  "merchant",
  "tags",
  "project",
]);

export function transactionToCsvRow(row: CsvTransactionRow): string {
  return csvLine([
    row.date,
    row.type,
    formatMinorToMajor(row.amountMinor),
    row.currency,
    formatMinorToMajor(row.baseAmountMinor),
    row.category,
    row.pool,
    row.note,
    row.status,
    row.createdBy,
    row.merchant,
    row.tags,
    row.project,
  ]);
}
