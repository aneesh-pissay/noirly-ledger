import type { ReminderSettings } from "@/src/core/reminders";
import type { Cadence } from "@/src/core/subscriptions";

/**
 * What's worth knowing about subscriptions: one that got dearer, two that
 * do the same job (the same bill set up twice, or two music services), and
 * a tracked one coming up for its next charge that hasn't been checked on
 * in a while. Spending can't show whether something is used, so that one
 * asks.
 */

/** A subscription and what it has charged, oldest first: a tracked recurring bill, or one spotted in spending. */
export type SubscriptionSeries = {
  key: string;
  name: string;
  currency: string;
  cadence: Cadence;
  charges: Array<{ date: string; amountMinor: number }>;
  monthlyMinor: number;
  nextDate: string | null;
  /** The recurring rule, when it's tracked; spotted ones have none. */
  ruleId: string | null;
  /** When someone last said they still use it. */
  reviewedOn: string | null;
};

export type SubscriptionInsight =
  | { id: string; kind: "price"; name: string; currency: string; fromMinor: number; toMinor: number; percent: number; on: string; ruleId: string | null }
  | { id: string; kind: "duplicate"; names: string[]; group: string | null; currency: string; monthlyMinor: number; ruleIds: string[] }
  | { id: string; kind: "review"; name: string; currency: string; yearlyMinor: number; nextDate: string; ruleId: string; reminders?: ReminderSettings | null };

/** Services that do the same job; paying for two is often one too many. Names are matched on their words. */
export const SERVICE_GROUPS: Record<string, string[]> = {
  "video streaming": ["netflix", "prime video", "amazon prime", "hotstar", "disney", "sonyliv", "sony liv", "zee5", "jiocinema", "jio cinema", "youtube premium", "apple tv"],
  "music streaming": ["spotify", "apple music", "youtube music", "gaana", "jiosaavn", "jio saavn", "wynk", "amazon music"],
  "cloud storage": ["google one", "icloud", "dropbox", "onedrive"],
  "food delivery membership": ["swiggy one", "zomato gold", "zomato pro"],
};

/** A rise smaller than this is rounding or tax, not a price change. */
const PRICE_RISE_MIN = 0.01;
/** Ask again whether it's still used after this long. */
export const REVIEW_EVERY_DAYS = 180;
/** Ask this many days before the next charge, with time to cancel. */
export const REVIEW_AHEAD_DAYS = 14;

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const YEAR: Record<Cadence, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

/** The service group a name belongs to, if any. */
export function serviceGroup(name: string) {
  const text = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  for (const [group, services] of Object.entries(SERVICE_GROUPS)) {
    if (services.some((s) => text.includes(` ${s} `))) return group;
  }
  return null;
}

/** The latest charge against the one before, when it went up. */
export function priceRise(series: SubscriptionSeries): Extract<SubscriptionInsight, { kind: "price" }> | null {
  const [before, last] = series.charges.slice(-2);
  if (!before || !last || last.amountMinor <= before.amountMinor * (1 + PRICE_RISE_MIN)) return null;
  return {
    id: `price:${series.key}:${last.date}`,
    kind: "price",
    name: series.name,
    currency: series.currency,
    fromMinor: before.amountMinor,
    toMinor: last.amountMinor,
    percent: Math.round(((last.amountMinor - before.amountMinor) / before.amountMinor) * 100),
    on: last.date,
    ruleId: series.ruleId,
  };
}

/** Subscriptions doing the same job: one merchant set up more than once, or two services from one group. */
export function duplicateSubscriptions(all: SubscriptionSeries[]): Array<Extract<SubscriptionInsight, { kind: "duplicate" }>> {
  const out: Array<Extract<SubscriptionInsight, { kind: "duplicate" }>> = [];
  const add = (members: SubscriptionSeries[], group: string | null) => {
    const currency = members[0]!.currency;
    out.push({
      id: `duplicate:${group ?? members[0]!.key}:${members.map((m) => m.ruleId ?? m.key).sort().join(",")}`,
      kind: "duplicate",
      names: members.map((m) => m.name),
      group,
      currency,
      monthlyMinor: members.filter((m) => m.currency === currency).reduce((sum, m) => sum + m.monthlyMinor, 0),
      ruleIds: members.map((m) => m.ruleId).filter((id): id is string => Boolean(id)),
    });
  };
  const byKey = new Map<string, SubscriptionSeries[]>();
  for (const s of all) byKey.set(s.key, [...(byKey.get(s.key) ?? []), s]);
  for (const members of byKey.values()) if (members.length > 1) add(members, null);

  const byGroup = new Map<string, SubscriptionSeries[]>();
  for (const members of byKey.values()) {
    const group = serviceGroup(members[0]!.name);
    if (group) byGroup.set(group, [...(byGroup.get(group) ?? []), members[0]!]);
  }
  for (const [group, members] of byGroup) if (members.length > 1) add(members, group);
  return out;
}

/** A tracked subscription to check on: its next charge is near, and nobody has said it's still used for half a year. */
export function needsReview(series: SubscriptionSeries, today: string): Extract<SubscriptionInsight, { kind: "review" }> | null {
  if (!series.ruleId || !series.nextDate) return null;
  const ahead = daysBetween(today, series.nextDate);
  if (ahead < 0 || ahead > REVIEW_AHEAD_DAYS) return null;
  if (series.reviewedOn && daysBetween(series.reviewedOn, today) < REVIEW_EVERY_DAYS) return null;
  // Charged for a while: a brand-new one was just chosen.
  if (series.charges.length && daysBetween(series.charges[0]!.date, today) < 60) return null;
  return {
    id: `review:${series.ruleId}:${series.nextDate}`,
    kind: "review",
    name: series.name,
    currency: series.currency,
    yearlyMinor: Math.round((series.charges.at(-1)?.amountMinor ?? 0) * YEAR[series.cadence]),
    nextDate: series.nextDate,
    ruleId: series.ruleId,
  };
}

/** Every insight for a set of subscriptions: price rises, then doubles, then ones to check on. */
export function subscriptionInsights(all: SubscriptionSeries[], today: string): SubscriptionInsight[] {
  return [
    ...all.map(priceRise).filter((i): i is NonNullable<typeof i> => Boolean(i)),
    ...duplicateSubscriptions(all),
    ...all.map((s) => needsReview(s, today)).filter((i): i is NonNullable<typeof i> => Boolean(i)),
  ];
}
