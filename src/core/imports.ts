import { parseMajorToMinor } from "@/src/core/money";

/**
 * Statement import: a bank or card statement (CSV, or the first sheet of an
 * XLSX) becomes transactions. The columns are matched to date, description
 * and amount (one signed column, a debit/credit pair, or an amount with a
 * Dr/Cr column), each row is checked, and nothing is added until the person
 * has seen the preview. A whole import can be taken back.
 */

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Reads CSV text into rows of cells: quoted fields, doubled quotes, any line ending, and , ; or tab as the separator. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts[0]![0] : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

export type ColumnMapping = {
  /** Which row holds the column names (0-based); rows above it are skipped. */
  headerRow: number;
  date: number | null;
  description: number | null;
  /** One signed amount, or with drCr telling the sign. */
  amount: number | null;
  drCr: number | null;
  /** Money out and money in, in two columns. */
  debit: number | null;
  credit: number | null;
  reference: number | null;
  dateFormat: DateFormat;
  /** A card statement's way: plain amounts are charges (money out), and only those marked Cr come in. */
  chargesPositive?: boolean;
  /** The bank layout this mapping came from, if any (see bank-formats). */
  bank?: string | null;
};

export const DATE_FORMATS = ["DMY", "MDY", "YMD"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

const has = (header: string, ...words: string[]) => words.some((w) => header.includes(w));

/** The header row is the first one that names a date and an amount (statements often start with account details). */
export function findHeaderRow(rows: string[][]) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i]!.map((c) => c.toLowerCase());
    if (cells.some((c) => has(c, "date")) && cells.some((c) => has(c, "amount", "debit", "credit", "withdrawal", "deposit", "amt"))) return i;
  }
  return 0;
}

/** A first guess at which column is which, from the header names banks use. */
export function guessMapping(rows: string[][]): ColumnMapping {
  const headerRow = findHeaderRow(rows);
  const headers = (rows[headerRow] ?? []).map((h) => h.toLowerCase());
  const find = (test: (h: string) => boolean) => {
    const i = headers.findIndex(test);
    return i === -1 ? null : i;
  };
  const date = find((h) => has(h, "txn date", "transaction date", "tran date", "posting date")) ?? find((h) => has(h, "date") && !has(h, "value"));
  const debit = find((h) => has(h, "withdrawal", "debit") && !has(h, "credit"));
  const credit = find((h) => has(h, "deposit", "credit") && !has(h, "debit"));
  const drCr = find((h) => h === "dr/cr" || h === "cr/dr" || has(h, "dr / cr", "type"));
  const amount = debit != null && credit != null ? null : find((h) => has(h, "amount", "amt"));
  return {
    headerRow,
    date,
    description: find((h) => has(h, "narration", "description", "particulars", "details", "remarks")),
    amount,
    drCr: amount != null ? drCr : null,
    debit: amount == null ? debit : null,
    credit: amount == null ? credit : null,
    reference: find((h) => has(h, "ref", "chq", "cheque", "utr")),
    dateFormat: guessDateFormat(rows.slice(headerRow + 1).map((r) => (date != null ? r[date] ?? "" : ""))),
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Day-first unless some date only makes sense month-first (a "day" over 12 in the second place). */
export function guessDateFormat(samples: string[]): DateFormat {
  let monthFirst = false;
  for (const sample of samples.slice(0, 50)) {
    const parts = sample.trim().split(/[/.\-\s]+/);
    if (parts.length < 3) continue;
    if (/^\d{4}$/.test(parts[0]!)) return "YMD";
    if (Number(parts[1]) > 12 && Number(parts[0]) <= 12) monthFirst = true;
  }
  return monthFirst ? "MDY" : "DMY";
}

/** A statement date as YYYY-MM-DD: numeric in the given order, a month name (12-Oct-2026), or a spreadsheet day number. Null when it can't be read. */
export function parseStatementDate(text: string, format: DateFormat): string | null {
  const value = text.trim();
  if (!value) return null;
  // Spreadsheet dates arrive as day counts from 1899-12-30.
  if (/^\d{5}(\.\d+)?$/.test(value)) {
    const days = Math.floor(Number(value));
    if (days < 20_000 || days > 80_000) return null;
    return new Date(Date.UTC(1899, 11, 30 + days)).toISOString().slice(0, 10);
  }
  const datePart = value.split(/[ T](?=\d{1,2}:)/)[0]!;
  const parts = datePart.split(/[/.\-\s,]+/).filter(Boolean);
  if (parts.length < 3) return null;
  let year: number;
  let month: number;
  let day: number;
  const named = parts.findIndex((p) => MONTHS.includes(p.slice(0, 3).toLowerCase()) && /^[a-z]+$/i.test(p));
  if (named !== -1) {
    month = MONTHS.indexOf(parts[named]!.slice(0, 3).toLowerCase()) + 1;
    const others = parts.filter((_, i) => i !== named).map(Number);
    [day, year] = others[0]! > 31 ? [others[1]!, others[0]!] : [others[0]!, others[1]!];
  } else {
    const [a, b, c] = parts.map(Number) as [number, number, number];
    if (format === "YMD") [year, month, day] = [a, b, c];
    else if (format === "MDY") [month, day, year] = [a, b, c];
    else [day, month, year] = [a, b, c];
  }
  if (year < 100) year += 2000;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * A statement amount in minor units: commas and currency symbols ignored,
 * "(12.50)" or a trailing "Dr" negative, "Cr" positive. Null when empty or
 * unreadable.
 */
export function parseStatementAmount(text: string): number | null {
  let value = text.trim().replace(/[₹$€£,\s]|INR|Rs\.?/gi, "");
  if (!value || value === "-") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(value)) {
    sign = -1;
    value = value.slice(1, -1);
  }
  if (/dr$/i.test(value)) {
    sign = -1;
    value = value.slice(0, -2);
  } else if (/cr$/i.test(value)) value = value.slice(0, -2);
  if (value.startsWith("-")) {
    sign = -sign;
    value = value.slice(1);
  } else if (value.startsWith("+")) value = value.slice(1);
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  try {
    return sign * parseMajorToMinor(`${whole}.${frac.slice(0, 2).padEnd(2, "0")}`);
  } catch {
    return null;
  }
}

export type ImportRow = {
  /** Its line in the file, counting from 1, so errors can be found there. */
  line: number;
  date: string | null;
  description: string;
  /** Positive is money in, negative money out. */
  amountMinor: number | null;
  reference: string | null;
  error: string | null;
};

/** Every row under the header, read through the mapping, each with what's wrong with it if anything. */
export function mapRows(rows: string[][], mapping: ColumnMapping): ImportRow[] {
  const cell = (row: string[], index: number | null) => (index == null ? "" : (row[index] ?? "").trim());
  return rows.slice(mapping.headerRow + 1).map((row, i) => {
    const date = parseStatementDate(cell(row, mapping.date), mapping.dateFormat);
    let amountMinor: number | null = null;
    if (mapping.amount != null) {
      amountMinor = parseStatementAmount(cell(row, mapping.amount));
      const drCr = cell(row, mapping.drCr).toLowerCase();
      if (amountMinor != null && drCr) amountMinor = Math.abs(amountMinor) * (drCr.startsWith("d") ? -1 : 1);
      else if (amountMinor != null && mapping.chargesPositive) amountMinor = -amountMinor;
    } else {
      const out = parseStatementAmount(cell(row, mapping.debit));
      const inn = parseStatementAmount(cell(row, mapping.credit));
      if (out || inn) amountMinor = Math.abs(inn ?? 0) - Math.abs(out ?? 0);
    }
    const description = cell(row, mapping.description).replace(/\s+/g, " ").slice(0, 500);
    let error: string | null = null;
    if (mapping.date == null) error = "Pick the date column";
    else if (mapping.amount == null && (mapping.debit == null || mapping.credit == null)) error = "Pick the amount column, or the debit and credit columns";
    else if (!date) error = `Couldn't read the date "${cell(row, mapping.date)}"`;
    else if (amountMinor == null) error = "No amount";
    else if (amountMinor === 0) error = "The amount is zero";
    return { line: mapping.headerRow + i + 2, date, description, amountMinor, reference: cell(row, mapping.reference) || null, error };
  });
}
