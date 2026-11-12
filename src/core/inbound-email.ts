import type { MailAddress, ParsedMail } from "@/src/core/mime";

/**
 * Receipts and bills emailed to a workspace. Each workspace can have a
 * forwarding address, r-<secret>@<inbound domain>; mail sent to it by a
 * member puts its receipt files (PDF and images) in the receipts inbox, with
 * the date, amount and shop guessed from the email, and an email that says
 * how much is due and by when becomes a bill to pay.
 */

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
export const MAX_FILES_PER_EMAIL = 10;

/** A workspace's address as its members see it, with the last emails it got. */
export type InboundView = {
  configured: boolean;
  canManage: boolean;
  address: { email: string; enabled: boolean; makeBills: boolean; createdAt: string } | null;
  recent: Array<{ id: string; from: string | null; subject: string | null; status: string; reason: string | null; receipts: number; billMade: boolean; receivedAt: string }>;
};

/** The part before the @: a prefix and a secret that can't be guessed. */
export function isAddressLocalPart(text: string) {
  return /^r-[a-z0-9]{16}$/.test(text);
}

/** The workspace secret a message was sent to, from its recipients at the inbound domain (plus-tags allowed). */
export function addressedLocalPart(recipients: string[], domain: string): string | null {
  const suffix = `@${domain.toLowerCase()}`;
  for (const recipient of recipients) {
    if (!recipient.endsWith(suffix)) continue;
    const local = recipient.slice(0, -suffix.length).split("+")[0]!;
    if (isAddressLocalPart(local)) return local;
  }
  return null;
}

const CURRENCY_MARKS: Array<[RegExp, string]> = [
  [/₹|\brs\.?|\binr\b/i, "INR"],
  [/\$|\busd\b/i, "USD"],
  [/€|\beur\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
];

const AMOUNT = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const MARK = String.raw`(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)`;

function toMinor(text: string) {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

function currencyOf(text: string) {
  for (const [pattern, code] of CURRENCY_MARKS) if (pattern.test(text)) return code;
  return null;
}

/** The amount after one of the labels ("Total", "Amount due"), with its currency mark if it has one. */
function labelledAmount(text: string, labels: string): { amountMinor: number; currency: string | null } | null {
  const pattern = new RegExp(String.raw`(?:${labels})\s*(?:\([^)]*\))?\s*(?:is|of|:|-)?\s*(${MARK})?\s*${AMOUNT}\s*(${MARK})?`, "gi");
  let best: { amountMinor: number; currency: string | null } | null = null;
  for (const m of text.matchAll(pattern)) {
    const amountMinor = toMinor(m[2]!);
    if (amountMinor === null) continue;
    // The last match wins: a grand total comes after the subtotals.
    best = { amountMinor, currency: currencyOf(`${m[1] ?? ""} ${m[3] ?? ""}`) };
  }
  return best;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function validDate(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const DATE = String.raw`(\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?[ -](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?[ -]\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?,? \d{4})`;

/** A date written without doubt about its order: 2026-11-12, 12 Nov 2026, Nov 12, 2026. (12/11/2026 could be either.) */
export function readDate(text: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return validDate(+iso[1]!, +iso[2]!, +iso[3]!);
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?[ -]([a-z]{3})[a-z]*,?[ -](\d{4})$/i.exec(text);
  if (dayFirst) return validDate(+dayFirst[3]!, MONTHS.indexOf(dayFirst[2]!.toLowerCase()) + 1, +dayFirst[1]!);
  const monthFirst = /^([a-z]{3})[a-z]* (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/i.exec(text);
  if (monthFirst) return validDate(+monthFirst[3]!, MONTHS.indexOf(monthFirst[1]!.toLowerCase()) + 1, +monthFirst[2]!);
  return null;
}

/** Who a forwarded message was first from: the "From:" line of the forwarded part. */
export function forwardedFrom(text: string): MailAddress | null {
  const m = /^[>\s]*From:\s*(?:"?([^"<\n]+?)"?\s*)?<?([^\s<>@]+@[^\s<>]+?)>?\s*$/im.exec(text);
  if (!m) return null;
  return { name: m[1]?.trim() || null, address: m[2]!.toLowerCase() };
}

function shopName(sender: MailAddress | null) {
  if (!sender) return null;
  const name = sender.name?.replace(/\b(no-?reply|notifications?|alerts?|support|team|orders?|billing|receipts?|via .*)\b/gi, "").replace(/[^\p{L}\p{N}&' ]+/gu, " ").replace(/\s+/g, " ").trim();
  if (name) return name.slice(0, 80);
  // Else the domain: noreply@mail.swiggy.in → Swiggy.
  const parts = sender.address.split("@")[1]?.split(".") ?? [];
  const main = parts.length >= 3 && parts.at(-2)!.length <= 3 ? parts.at(-3) : parts.at(-2);
  return main ? main[0]!.toUpperCase() + main.slice(1) : null;
}

export type EmailGuess = { date: string | null; amountMinor: number | null; currency: string | null; merchant: string | null };

/**
 * What a receipt email is for: the total it states, the shop it's from (the
 * forwarded sender, or else the sender), and the day it was sent.
 */
export function guessFromEmail(mail: Pick<ParsedMail, "from" | "subject" | "date" | "text">, memberSender: boolean): EmailGuess {
  const text = `${mail.subject}\n${mail.text}`;
  const total =
    labelledAmount(text, "grand total|order total|total paid|amount paid|total amount|you paid|paid|total") ??
    (() => {
      const m = new RegExp(String.raw`(${MARK})\s*${AMOUNT}`, "i").exec(text);
      return m ? { amountMinor: toMinor(m[2]!)!, currency: currencyOf(m[1]!) } : null;
    })();
  const forwarded = forwardedFrom(mail.text);
  const forwardedDate = /^[>\s]*(?:Date|Sent):\s*(.+)$/im.exec(mail.text)?.[1];
  const forwardedDay = forwardedDate ? (readDate(forwardedDate.replace(/^[a-z]+,\s*/i, "").replace(/\s+at\s+.*$|\s+\d{1,2}:\d{2}.*$/i, "").trim()) ?? null) : null;
  return {
    date: forwardedDay ?? mail.date,
    amountMinor: total?.amountMinor ?? null,
    currency: total?.currency ?? null,
    // A member forwarding it isn't the shop.
    merchant: shopName(forwarded ?? (memberSender ? null : mail.from)),
  };
}

export type BillGuess = { dueDate: string; amountMinor: number; currency: string | null };

/** A bill email: one that says both what's due and the date it's due by. */
export function guessBill(mail: Pick<ParsedMail, "subject" | "text">): BillGuess | null {
  const text = `${mail.subject}\n${mail.text}`;
  const due = new RegExp(String.raw`(?:due\s*(?:date|on|by)?|pay\s*by|payment\s*due(?:\s*date)?|last\s*date(?:\s*of\s*payment)?)\s*(?:is|:|-)?\s*${DATE}`, "i").exec(text);
  const dueDate = due ? readDate(due[1]!.replace(/(\d)(st|nd|rd|th)/i, "$1").replace(/,/g, "").replace(/\s+/g, " ")) : null;
  if (!dueDate) return null;
  const amount = labelledAmount(text, "total amount due|amount due|amount payable|total due|balance due|bill amount|amount");
  if (!amount) return null;
  return { dueDate, ...amount };
}

/** A name for a bill from the email: the biller, or the subject. */
export function billName(mail: Pick<ParsedMail, "from" | "subject" | "text">, memberSender: boolean) {
  return (shopName(forwardedFrom(mail.text) ?? (memberSender ? null : mail.from)) ?? mail.subject.replace(/^(fwd?|fw):\s*/i, "").trim()).slice(0, 80) || "Emailed bill";
}

/** The files worth keeping: receipts by type and size, the first few. */
export function receiptFiles<T extends { name: string; contentType: string; bytes: Uint8Array }>(attachments: T[]) {
  return attachments
    .filter((a) => (RECEIPT_TYPES as readonly string[]).includes(a.contentType) && a.bytes.byteLength > 0 && a.bytes.byteLength <= MAX_RECEIPT_BYTES)
    // Signatures and tracking pixels are tiny images; a receipt isn't.
    .filter((a) => a.contentType === "application/pdf" || a.bytes.byteLength >= 4 * 1024)
    .slice(0, MAX_FILES_PER_EMAIL);
}
