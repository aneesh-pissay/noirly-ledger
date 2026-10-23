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
  /** GST, when the transaction has it; amounts in its currency. */
  gst?: { ratePct: number; taxableMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number; gstin: string | null; hsn: string | null } | null;
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
  "gst_rate",
  "taxable_value",
  "cgst",
  "sgst",
  "igst",
  "gstin",
  "hsn_sac",
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
    row.gst ? String(row.gst.ratePct) : "",
    row.gst ? formatMinorToMajor(row.gst.taxableMinor) : "",
    row.gst ? formatMinorToMajor(row.gst.cgstMinor) : "",
    row.gst ? formatMinorToMajor(row.gst.sgstMinor) : "",
    row.gst ? formatMinorToMajor(row.gst.igstMinor) : "",
    row.gst?.gstin ?? "",
    row.gst?.hsn ?? "",
  ]);
}
