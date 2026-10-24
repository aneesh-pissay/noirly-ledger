/**
 * When two transactions look like the same payment recorded twice: typed in
 * and then imported, imported from two overlapping statements, or entered
 * by two people in a shared workspace. Used while entering one, on import,
 * and to review what's already in the ledger.
 */

export type DuplicateCandidate = {
  id?: string;
  type: string;
  /** Positive, in the transaction's own currency. */
  amountMinor: number;
  currency: string;
  /** YYYY-MM-DD. */
  date: string;
  accountId: string | null;
  /** Note, merchant, or a statement's description: whatever says what it was. */
  text: string;
  upiRef: string | null;
};

/** Days apart two records of one payment can be: a card charge often posts a day or two after it was made. */
export const DUPLICATE_WINDOW_DAYS = 3;

export type DuplicateReason = "upi" | "same-day" | "nearby";

/** The words that say what it was, leaving out reference numbers and short bits like "upi" or "to". */
export function describingWords(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/\d{4,}/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !["upi", "neft", "imps", "rtgs", "pos", "the", "and", "for", "from", "transfer", "payment"].includes(word)),
  );
}

/** Whether two descriptions name the same thing: one's words all in the other, or most words shared. */
export function similarText(a: string, b: string) {
  const x = describingWords(a);
  const y = describingWords(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((word) => y.has(word)).length;
  return shared === Math.min(x.size, y.size) || shared / new Set([...x, ...y]).size >= 0.5;
}

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * Why b looks like a second record of a, or null. The same UPI reference
 * always is. Otherwise both must be the same kind, amount and currency, in
 * the same account (or one without an account), and either on the same day
 * or a few days apart with descriptions that match.
 */
export function duplicateReason(a: DuplicateCandidate, b: DuplicateCandidate, windowDays = DUPLICATE_WINDOW_DAYS): DuplicateReason | null {
  if (a.id && a.id === b.id) return null;
  if (a.upiRef && a.upiRef === b.upiRef) return "upi";
  if (a.type !== b.type || a.amountMinor !== b.amountMinor || a.currency !== b.currency) return null;
  if (a.accountId && b.accountId && a.accountId !== b.accountId) return null;
  const apart = daysBetween(a.date, b.date);
  if (apart === 0) return "same-day";
  if (apart <= windowDays && similarText(a.text, b.text)) return "nearby";
  return null;
}

/** Pairs within a list that look like the same payment, earlier-recorded first; a pair is only listed once. */
export function duplicatePairs<T extends DuplicateCandidate & { id: string }>(items: T[], dismissed: (a: string, b: string) => boolean = () => false) {
  const pairs: Array<{ first: T; second: T; reason: DuplicateReason }> = [];
  const byAmount = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.type}|${item.amountMinor}|${item.currency}`;
    byAmount.set(key, [...(byAmount.get(key) ?? []), item]);
  }
  const consider = (a: T, b: T) => {
    if (dismissed(a.id, b.id)) return;
    const reason = duplicateReason(a, b);
    if (reason) pairs.push({ first: a, second: b, reason });
  };
  for (const group of byAmount.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) consider(group[i]!, group[j]!);
  }
  // The same UPI reference on different amounts is still one payment.
  const byRef = new Map<string, T[]>();
  for (const item of items) if (item.upiRef) byRef.set(item.upiRef, [...(byRef.get(item.upiRef) ?? []), item]);
  for (const group of byRef.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i]!, group[j]!];
        if (a.type !== b.type || a.amountMinor !== b.amountMinor || a.currency !== b.currency) consider(a, b);
      }
    }
  }
  return pairs.sort((x, y) => (y.second.date < x.second.date ? -1 : y.second.date > x.second.date ? 1 : 0));
}
