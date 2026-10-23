import type { ColumnMapping, DateFormat } from "@/src/core/imports";

/**
 * Statement layouts of major Indian banks, so their exports import without
 * picking columns by hand. Each is recognised by its column names (banks
 * vary them a little between savings, current and card statements, so each
 * column lists the names seen for it). When nothing matches, the import
 * falls back to guessing from the column names.
 */

type ColumnNames = Partial<Record<"date" | "description" | "amount" | "drCr" | "debit" | "credit" | "reference", string[]>>;

export type BankFormat = {
  id: string;
  name: string;
  columns: ColumnNames;
  dateFormat: DateFormat;
  /** Card statements: plain amounts are charges. */
  chargesPositive?: boolean;
};

/** A header as compared: lowercase letters and digits only, so "Withdrawal Amt." and "withdrawal amt" match. */
export function headerKey(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const BANK_FORMATS: BankFormat[] = [
  {
    id: "hdfc",
    name: "HDFC Bank",
    columns: {
      date: ["date", "transactiondate"],
      description: ["narration"],
      reference: ["chqrefno", "chequerefno"],
      debit: ["withdrawalamt", "withdrawalamount"],
      credit: ["depositamt", "depositamount"],
    },
    dateFormat: "DMY",
  },
  {
    id: "icici",
    name: "ICICI Bank",
    columns: {
      date: ["transactiondate", "valuedate"],
      description: ["transactionremarks", "remarks"],
      reference: ["chequenumber", "chequeno"],
      debit: ["withdrawalamountinr", "withdrawalamount"],
      credit: ["depositamountinr", "depositamount"],
    },
    dateFormat: "DMY",
  },
  {
    id: "icici-card",
    name: "ICICI Bank credit card",
    columns: {
      date: ["date", "transactiondate"],
      description: ["transactiondetails"],
      reference: ["srno", "referencenumber"],
      amount: ["amountinrs", "amountinr", "amount"],
      drCr: ["billingamountsign", "crdr", "drcr"],
    },
    dateFormat: "DMY",
    chargesPositive: true,
  },
  {
    id: "sbi",
    name: "State Bank of India",
    columns: {
      date: ["txndate", "transactiondate"],
      description: ["description", "narration"],
      reference: ["refnochequeno", "refno", "chequeno"],
      debit: ["debit", "withdrawal"],
      credit: ["credit", "deposit"],
    },
    dateFormat: "DMY",
  },
  {
    id: "axis",
    name: "Axis Bank",
    columns: {
      date: ["trandate", "transactiondate"],
      description: ["particulars"],
      reference: ["chqno", "chequeno"],
      debit: ["dr", "debit", "withdrawalamt"],
      credit: ["cr", "credit", "depositamt"],
    },
    dateFormat: "DMY",
  },
  {
    id: "kotak",
    name: "Kotak Mahindra Bank",
    columns: {
      date: ["transactiondate", "date"],
      description: ["description", "narration"],
      reference: ["chqrefno", "chequerefno", "refno"],
      amount: ["amount"],
      drCr: ["drcr", "crdr"],
      debit: ["debit", "withdrawalamount"],
      credit: ["credit", "depositamount"],
    },
    dateFormat: "DMY",
  },
];

export function bankFormat(id: string | null | undefined) {
  return BANK_FORMATS.find((format) => format.id === id) ?? null;
}

/**
 * The format's mapping onto a header row, or null if the row lacks its date,
 * its description and a complete way of reading amounts (one amount column,
 * or both debit and credit).
 */
export function mapFormat(format: BankFormat, headers: string[], headerRow: number): ColumnMapping | null {
  const keys = headers.map(headerKey);
  const find = (names: string[] | undefined) => {
    if (!names) return null;
    for (const name of names) {
      const i = keys.indexOf(name);
      if (i !== -1) return i;
    }
    return null;
  };
  const date = find(format.columns.date);
  const description = find(format.columns.description);
  const debit = find(format.columns.debit);
  const credit = find(format.columns.credit);
  const amount = debit != null && credit != null ? null : find(format.columns.amount);
  if (date == null || description == null || (amount == null && (debit == null || credit == null))) return null;
  return {
    headerRow,
    date,
    description,
    amount,
    drCr: amount != null ? find(format.columns.drCr) : null,
    debit: amount == null ? debit : null,
    credit: amount == null ? credit : null,
    reference: find(format.columns.reference),
    dateFormat: format.dateFormat,
    ...(amount != null && format.chargesPositive ? { chargesPositive: true } : {}),
    bank: format.id,
  };
}

/** The format's mapping onto the first header row (within the first 30) it fits, or null. */
export function findBankFormat(rows: string[][], format: BankFormat): ColumnMapping | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const mapping = mapFormat(format, rows[i]!, i);
    if (mapping) return mapping;
  }
  return null;
}

/** How many of the format's columns a header row has; more means a closer match. */
function score(format: BankFormat, headers: string[]) {
  const keys = new Set(headers.map(headerKey));
  return Object.values(format.columns).filter((names) => names?.some((name) => keys.has(name))).length;
}

/**
 * Which bank's statement this is, looking for a header row (within the first
 * 30 rows, under any account details) that one of the layouts fits. The
 * closest fit wins; a bank named in the lines above the header breaks ties.
 */
export function detectBankFormat(rows: string[][]): { format: BankFormat; mapping: ColumnMapping } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const headers = rows[i]!;
    const above = rows.slice(0, i).flat().join(" ").toLowerCase();
    const fits = BANK_FORMATS.map((format) => ({ format, mapping: mapFormat(format, headers, i) }))
      .filter((fit): fit is { format: BankFormat; mapping: ColumnMapping } => fit.mapping != null)
      .map((fit) => ({ ...fit, score: score(fit.format, headers) + (above.includes(fit.format.name.toLowerCase().split(" ")[0]!) ? 0.5 : 0) }))
      .sort((a, b) => b.score - a.score);
    if (fits[0]) return { format: fits[0].format, mapping: fits[0].mapping };
  }
  return null;
}
