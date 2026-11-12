/**
 * Sensitive data kept to what's needed. Account numbers are stored sealed
 * and shown masked (the last four), and only shown whole when someone asks,
 * which is recorded. Notes on transactions and bills are stored sealed too,
 * and found by search through keyed hashes of their words' beginnings, so
 * the database never holds the words themselves.
 */

/** Spaces and dashes dropped, letters upper-cased: 4 to 34 letters and digits (an IBAN is up to 34). */
export function normalizeAccountNumber(text: string): string | null {
  const clean = text.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z0-9]{4,34}$/.test(clean) ? clean : null;
}

export function lastFour(number: string) {
  return number.slice(-4);
}

/** How an account number is shown: "•••• 1234". */
export function maskAccountNumber(last4: string | null | undefined) {
  return last4 ? `•••• ${last4}` : null;
}

/** Shortest and longest word beginnings a search can match on. */
export const MIN_TERM = 2;
export const MAX_TERM = 12;

function words(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= MIN_TERM);
}

/** Every beginning of every word in a note, 2 to 12 characters: what gets hashed for search. */
export function noteTerms(text: string | null | undefined): string[] {
  if (!text) return [];
  const terms = new Set<string>();
  for (const word of words(text)) {
    for (let n = MIN_TERM; n <= Math.min(word.length, MAX_TERM); n++) terms.add(word.slice(0, n));
  }
  return [...terms];
}

/** The terms a search looks for: each of its words (cut to 12), all of which a note must have. */
export function searchTerms(text: string): string[] {
  return [...new Set(words(text).map((w) => w.slice(0, MAX_TERM)))];
}

/** What the audit history keeps of a sensitive field's change: that it changed, not what it said. */
export const REDACTED = "(hidden)";
