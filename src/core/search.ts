import { parseMajorToMinor } from "@/src/core/money";

/**
 * Transaction search: one box that matches notes, merchants, tags and
 * category names by text, and amounts when what's typed is a number
 * ("450", "1,250.50", "₹450"). Saved views keep a search with its filters.
 */

/** What a typed search means: text to look for, and an amount if it reads as one. */
export function parseSearch(input: string | null | undefined): { text: string | null; amountMinor: number | null } {
  const text = (input ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (!text) return { text: null, amountMinor: null };
  const numeric = text.replace(/^[₹$€£]\s*/, "").replace(/\s*(inr|usd|eur|gbp|rs\.?)$/i, "");
  let amountMinor: number | null = null;
  if (/^\d[\d,]*(\.\d{1,2})?$/.test(numeric)) {
    try {
      amountMinor = parseMajorToMinor(numeric);
    } catch {
      amountMinor = null;
    }
  }
  return { text, amountMinor };
}

/** Text made safe to use inside a regular expression. */
export function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The filters a transaction list (and a saved view) can have. Amounts are major units as typed. */
export const VIEW_FILTER_KEYS = ["q", "type", "category", "account", "tag", "merchant", "project", "from", "to", "min", "max", "clearing"] as const;
export type ViewFilterKey = (typeof VIEW_FILTER_KEYS)[number];
export type ViewFilters = Partial<Record<ViewFilterKey, string>>;

/** Filters from a page's query string, keeping only known, non-empty ones. */
export function filtersFromParams(params: { get(key: string): string | null }): ViewFilters {
  const filters: ViewFilters = {};
  for (const key of VIEW_FILTER_KEYS) {
    const value = params.get(key)?.trim();
    if (value) filters[key] = value.slice(0, 120);
  }
  return filters;
}

/** A query string for filters, in a stable order so the same view always has the same link. */
export function filtersToQuery(filters: ViewFilters) {
  const params = new URLSearchParams();
  for (const key of VIEW_FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

/** Whether two sets of filters are the same view. */
export function sameFilters(a: ViewFilters, b: ViewFilters) {
  return filtersToQuery(a) === filtersToQuery(b);
}
