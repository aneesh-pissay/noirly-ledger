import { FX_RATE_SCALE } from "@/src/core/money";

/**
 * Automatic exchange rates from a provider (by default Frankfurter, which
 * publishes the European Central Bank's daily reference rates). A rate
 * someone set by hand always wins over a fetched one for the same day.
 * Fetched rates are kept like hand-set ones: how much of the base
 * currency one unit of the other is worth, from a day.
 */

/** What the provider covers (the ECB's reference currencies). */
export const PROVIDER_CURRENCIES = [
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK",
  "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
] as const;

export function providerCovers(currency: string) {
  return (PROVIDER_CURRENCIES as readonly string[]).includes(currency);
}

export type ProviderRates = { date: string; base: string; rates: Record<string, number> };

/**
 * A provider reply as stored rates: the provider gives how much of each
 * currency one base unit buys, so a unit of it is worth the inverse.
 */
export function toStoredRates(reply: ProviderRates, base: string): { date: string; scaled: Map<string, number> } {
  if (reply.base !== base) throw new Error(`Rates came for ${reply.base}, not ${base}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reply.date)) throw new Error("Rates came without a date");
  const scaled = new Map<string, number>();
  for (const [currency, perBase] of Object.entries(reply.rates)) {
    if (typeof perBase === "number" && perBase > 0 && Number.isFinite(perBase) && currency !== base) {
      scaled.set(currency, Math.round(FX_RATE_SCALE / perBase));
    }
  }
  return { date: reply.date, scaled };
}

/** Reads a provider reply, or says why it can't. */
export function parseProviderReply(json: unknown): ProviderRates {
  const r = json as Partial<ProviderRates> | null;
  if (!r || typeof r.base !== "string" || typeof r.date !== "string" || !r.rates || typeof r.rates !== "object") {
    throw new Error("The rates provider answered with something unexpected");
  }
  return { base: r.base, date: r.date, rates: r.rates as Record<string, number> };
}

/**
 * Whether to fetch a rate for an amount dated `asOf`: there's none, or the
 * one in force is a fetched one more than `staleDays` older (travel spending
 * entered later deserves that day's rate). Hand-set rates are left alone,
 * and nothing is fetched for days still to come.
 */
export function needsFetch(found: { effectiveFrom: string; source: "user" | "auto" } | null, asOf: string, today: string, staleDays = 7): boolean {
  if (asOf > today) return !found;
  if (!found) return true;
  if (found.source === "user") return false;
  const gap = (Date.parse(asOf) - Date.parse(found.effectiveFrom)) / 86_400_000;
  return gap > staleDays;
}

/**
 * Set rates for tests and offline runs (FX_RATES_URL=fixed): units of each
 * currency per US dollar. Cross rates come from these.
 */
export const FIXED_PER_USD: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.78, INR: 83.5, JPY: 150, SGD: 1.35, AUD: 1.52, CAD: 1.37, CHF: 0.88, THB: 36, AED: 3.6725,
};

export function fixedReply(base: string, symbols: readonly string[], date: string): ProviderRates {
  const perUsdBase = FIXED_PER_USD[base];
  if (!perUsdBase) throw new Error(`No set rates for ${base}`);
  const rates: Record<string, number> = {};
  for (const s of symbols) {
    const perUsd = FIXED_PER_USD[s];
    if (perUsd && s !== base) rates[s] = Math.round((perUsd / perUsdBase) * 1e6) / 1e6;
  }
  return { base, date, rates };
}
