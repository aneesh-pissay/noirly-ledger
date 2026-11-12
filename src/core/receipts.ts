import { similarText } from "@/src/core/duplicates";

/**
 * Receipts uploaded in bulk wait in an inbox until each is matched to its
 * transaction, by amount and date. Until receipts are read by OCR (Phase
 * 10), the date, amount and shop come from the file name when it has them
 * ("2026-10-01 Swiggy 450.pdf", "IMG_20261001_0932.jpg") and otherwise are
 * typed in.
 */

export type ReceiptGuess = { date: string | null; amountMinor: number | null; merchant: string | null };

/** Days either side of the receipt's date a transaction can be: card charges post late, and bills are paid after they're issued. */
export const RECEIPT_WINDOW_DAYS = 5;

function validDate(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** What a receipt's file name says about it: its date, amount and shop, each if it can be told. */
export function guessFromFileName(fileName: string): ReceiptGuess {
  let rest = ` ${fileName.replace(/\.[a-z0-9]{2,5}$/i, "")} `.replace(/[_]+/g, " ");
  let date: string | null = null;
  const datePatterns: Array<[RegExp, (m: RegExpExecArray) => string | null]> = [
    [/(?<!\d)(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?!\d)/, (m) => validDate(+m[1]!, +m[2]!, +m[3]!)],
    [/(?<!\d)(\d{1,2})[-.](\d{1,2})[-.](\d{4})(?!\d)/, (m) => validDate(+m[3]!, +m[2]!, +m[1]!)],
    [/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/, (m) => validDate(+m[1]!, +m[2]!, +m[3]!)],
    [/(?<!\d)(\d{1,2})[ -]?([a-z]{3})[a-z]*[ -]?(\d{4})(?!\d)/i, (m) => validDate(+m[3]!, MONTHS.indexOf(m[2]!.toLowerCase()) + 1, +m[1]!)],
  ];
  for (const [pattern, read] of datePatterns) {
    const match = pattern.exec(rest);
    const found = match ? read(match) : null;
    if (found) {
      date = found;
      rest = rest.replace(match![0], " ");
      break;
    }
  }
  // Camera-style names carry a time after the date; it isn't an amount.
  rest = rest.replace(/(?<![\d.,])\d{4,6}(?![\d.,])(?=\s*$)/, (time) => (date ? " " : time));

  let amountMinor: number | null = null;
  const marked = /(?:₹|rs\.?|inr)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i.exec(rest);
  const decimal = /(?<![\d.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{2})(?![\d.,])/.exec(rest);
  const plain = /(?<![\d.,])(\d{1,6})(?![\d.,])/.exec(rest);
  const amount = marked ?? decimal ?? plain;
  if (amount) {
    const value = Number(amount[1]!.replace(/,/g, ""));
    if (value > 0) {
      amountMinor = Math.round(value * 100);
      rest = rest.replace(amount[0], " ");
    }
  }

  const words = rest
    .replace(/\b(img|scan|receipt|invoice|bill|photo|pxl|dsc|whatsapp image|image|at)\b/gi, " ")
    .replace(/[^\p{L}\p{N}&' ]+/gu, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { date, amountMinor, merchant: words ? words.slice(0, 80) : null };
}

export type ReceiptFacts = { date: string | null; amountMinor: number | null; currency: string | null; merchant: string | null };

export type MatchCandidate = {
  id: string;
  type: string;
  amountMinor: number;
  currency: string;
  date: string;
  merchant: string | null;
  note: string | null;
  hasReceipt: boolean;
};

function daysApart(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * Transactions the receipt could be for, best first: the same amount (and
 * currency, when the receipt says), within a few days of its date, never a
 * transfer. Closer dates, a matching shop, and having no receipt yet rank
 * higher. Without an amount nothing can be matched.
 */
export function rankMatches<T extends MatchCandidate>(receipt: ReceiptFacts, candidates: T[]): T[] {
  if (receipt.amountMinor == null) return [];
  const scored = candidates
    .filter((c) => c.type !== "transfer" && c.amountMinor === receipt.amountMinor && (!receipt.currency || c.currency === receipt.currency))
    .filter((c) => !receipt.date || daysApart(c.date, receipt.date) <= RECEIPT_WINDOW_DAYS)
    .map((c) => {
      const apart = receipt.date ? daysApart(c.date, receipt.date) : RECEIPT_WINDOW_DAYS;
      const named = receipt.merchant && similarText(receipt.merchant, [c.merchant, c.note].filter(Boolean).join(" ")) ? 3 : 0;
      return { c, score: named + (c.hasReceipt ? 0 : 2) + (RECEIPT_WINDOW_DAYS - apart) / RECEIPT_WINDOW_DAYS };
    });
  return scored.sort((a, b) => b.score - a.score || (a.c.date < b.c.date ? 1 : -1)).map((s) => s.c);
}

/**
 * The match to make without asking: only when one transaction stands out,
 * that is the only candidate, or the only one with the receipt's shop name.
 */
export function confidentMatch<T extends MatchCandidate>(receipt: ReceiptFacts, candidates: T[]): T | null {
  const ranked = rankMatches(receipt, candidates).filter((c) => !c.hasReceipt);
  if (ranked.length === 1) return ranked[0]!;
  if (!receipt.merchant) return null;
  const named = ranked.filter((c) => similarText(receipt.merchant!, [c.merchant, c.note].filter(Boolean).join(" ")));
  return named.length === 1 ? named[0]! : null;
}
