import { describingWords } from "@/src/core/duplicates";
import { merchantKey } from "@/src/core/labels";
import { nextOccurrence } from "@/src/core/recurrence/next";

/**
 * Subscriptions spotted in past spending: the same merchant (or the same
 * words in the note) charging on a steady rhythm, weekly, monthly,
 * quarterly or yearly, for about the same amount each time. Found ones can
 * be tracked as recurring bills, or set aside as not subscriptions.
 */

export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";

export type SpendRecord = { id: string; date: string; amountMinor: number; currency: string; merchant: string | null; note: string | null };

export type SpottedSubscription = {
  /** What groups its charges: the merchant's key, or the note's words. */
  key: string;
  name: string;
  currency: string;
  cadence: Cadence;
  /** The usual charge (the median), and the latest one and the one before it. */
  typicalMinor: number;
  lastMinor: number;
  previousMinor: number;
  /** What it comes to over a month, for comparing and adding up. */
  monthlyMinor: number;
  count: number;
  firstDate: string;
  lastDate: string;
  nextDate: string;
  /** Charged recently enough that it looks still running. */
  active: boolean;
  transactionIds: string[];
  /** Its charges, oldest first. */
  charges: Array<{ date: string; amountMinor: number }>;
};

/** Days between charges each rhythm allows (a month is 28 to 31 days, give or take a late charge). */
const CADENCES: Array<{ cadence: Cadence; min: number; max: number; minCount: number; perMonth: number; step: number }> = [
  { cadence: "weekly", min: 6, max: 8, minCount: 4, perMonth: 52 / 12, step: 7 },
  { cadence: "monthly", min: 26, max: 35, minCount: 3, perMonth: 1, step: 30.4 },
  { cadence: "quarterly", min: 84, max: 98, minCount: 3, perMonth: 1 / 3, step: 91 },
  { cadence: "yearly", min: 350, max: 380, minCount: 2, perMonth: 1 / 12, step: 365 },
];

/** How far a charge can stray from the usual one and still be the same subscription (prices go up). */
const AMOUNT_TOLERANCE = 0.25;

function days(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** What groups a charge with its others: the merchant, else the note's words in order. */
export function subscriptionKey(record: Pick<SpendRecord, "merchant" | "note">) {
  const merchant = merchantKey(record.merchant);
  if (merchant) return `m:${merchant}`;
  const words = [...describingWords(record.note ?? "")].sort();
  return words.length ? `n:${words.join(" ")}` : null;
}

/** A name for charges grouped by their note's words: those words, capitalised. */
function nameFromWords(groupId: string) {
  if (!groupId.startsWith("n:")) return null;
  const words = groupId.slice(2, groupId.lastIndexOf("|"));
  return words.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** The date after `last` on the rhythm. */
export function nextCharge(last: string, cadence: Cadence) {
  const from = new Date(`${last}T12:00:00Z`);
  const next =
    cadence === "weekly"
      ? nextOccurrence(from, { frequency: "weekly", interval: 1 })
      : cadence === "yearly"
        ? nextOccurrence(from, { frequency: "yearly", interval: 1 })
        : nextOccurrence(from, { frequency: "monthly", interval: cadence === "quarterly" ? 3 : 1 });
  return next.toISOString().slice(0, 10);
}

/**
 * Charges that look like a subscription, biggest monthly cost first. Within
 * one merchant, charges far from the usual amount are left out (a one-off
 * purchase at the same shop); what's left must keep one rhythm: all but at
 * most one gap in its range.
 */
export function spotSubscriptions(records: SpendRecord[], today: string): SpottedSubscription[] {
  const groups = new Map<string, SpendRecord[]>();
  for (const record of records) {
    const key = subscriptionKey(record);
    if (!key) continue;
    const id = `${key}|${record.currency}`;
    groups.set(id, [...(groups.get(id) ?? []), record]);
  }

  const found: SpottedSubscription[] = [];
  for (const [id, group] of groups) {
    if (group.length < 2) continue;
    const usual = median(group.map((r) => r.amountMinor));
    const charges = group
      .filter((r) => Math.abs(r.amountMinor - usual) <= usual * AMOUNT_TOLERANCE)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    // Two charges the same day are one charge recorded twice, or two purchases; neither is a rhythm.
    const dated = charges.filter((r, i) => i === 0 || r.date !== charges[i - 1]!.date);
    const gaps = dated.slice(1).map((r, i) => days(dated[i]!.date, r.date));
    if (!gaps.length) continue;
    const typicalGap = median(gaps);
    const rhythm = CADENCES.find((c) => typicalGap >= c.min && typicalGap <= c.max);
    if (!rhythm || dated.length < rhythm.minCount) continue;
    const off = gaps.filter((g) => g < rhythm.min || g > rhythm.max).length;
    if (off > (gaps.length >= 4 ? 1 : 0)) continue;

    const last = dated.at(-1)!;
    const typicalMinor = median(dated.map((r) => r.amountMinor));
    found.push({
      key: id.slice(0, id.lastIndexOf("|")),
      // A note like "UPI/SPOTIFY/4285…" reads better as the words it was grouped by.
      name: last.merchant ?? nameFromWords(id) ?? "Subscription",
      currency: last.currency,
      cadence: rhythm.cadence,
      typicalMinor,
      lastMinor: last.amountMinor,
      previousMinor: dated.at(-2)!.amountMinor,
      // Costed at the latest price: what it charges from now on.
      monthlyMinor: Math.round(last.amountMinor * rhythm.perMonth),
      count: dated.length,
      firstDate: dated[0]!.date,
      lastDate: last.date,
      nextDate: nextCharge(last.date, rhythm.cadence),
      // Missing more than half a rhythm past its next charge looks cancelled.
      active: days(last.date, today) <= rhythm.max + rhythm.step / 2,
      transactionIds: dated.map((r) => r.id),
      charges: dated.map((r) => ({ date: r.date, amountMinor: r.amountMinor })),
    });
  }
  return found.sort((a, b) => b.monthlyMinor - a.monthlyMinor);
}
