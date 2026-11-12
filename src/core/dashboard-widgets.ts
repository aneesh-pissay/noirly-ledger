import { filtersToQuery } from "@/src/core/search";

/**
 * The dashboard: widgets each person picks, orders and sizes for
 * themselves, per workspace. Charts drill down: a category, a merchant or
 * a period opens the transactions behind it.
 */
export const WIDGET_TYPES = ["summary", "income-expense", "categories", "merchants", "budgets", "net-worth", "cash-flow"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_SIZES = ["half", "full"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export type Widget = { type: WidgetType; size: WidgetSize };

export const WIDGET_INFO: Record<WidgetType, { label: string; description: string; size: WidgetSize }> = {
  summary: { label: "Summary", description: "Income, spending and what's left", size: "full" },
  "income-expense": { label: "Income vs spending", description: "Period by period over the range", size: "half" },
  categories: { label: "Spending by category", description: "Where it went; open a category's transactions", size: "half" },
  merchants: { label: "Top merchants", description: "Who was paid most", size: "half" },
  budgets: { label: "Budget health", description: "What's left of each budget this period", size: "half" },
  "net-worth": { label: "Net worth", description: "What you have less what you owe", size: "half" },
  "cash-flow": { label: "Money on hand", description: "Cash, bank and wallets: in, out and left", size: "half" },
};

export const DEFAULT_LAYOUT: Widget[] = [
  { type: "summary", size: "full" },
  { type: "categories", size: "half" },
  { type: "income-expense", size: "half" },
  { type: "budgets", size: "half" },
  { type: "merchants", size: "half" },
];

/** A stored layout made safe: known widgets, each once, valid sizes. */
export function normalizeLayout(stored: ReadonlyArray<{ type?: unknown; size?: unknown }> | null | undefined): Widget[] {
  if (!stored) return DEFAULT_LAYOUT.map((w) => ({ ...w }));
  const seen = new Set<WidgetType>();
  const out: Widget[] = [];
  for (const w of stored) {
    const type = w.type as WidgetType;
    if (!WIDGET_TYPES.includes(type) || seen.has(type)) continue;
    seen.add(type);
    out.push({ type, size: WIDGET_SIZES.includes(w.size as WidgetSize) ? (w.size as WidgetSize) : WIDGET_INFO[type].size });
  }
  return out;
}

export function moveWidget(layout: readonly Widget[], index: number, by: -1 | 1): Widget[] {
  const to = index + by;
  if (index < 0 || to < 0 || to >= layout.length) return [...layout];
  const next = [...layout];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

export function removeWidget(layout: readonly Widget[], type: WidgetType): Widget[] {
  return layout.filter((w) => w.type !== type);
}

/** Adds a widget at the end, at its usual size (once). */
export function addWidget(layout: readonly Widget[], type: WidgetType): Widget[] {
  return layout.some((w) => w.type === type) ? [...layout] : [...layout, { type, size: WIDGET_INFO[type].size }];
}

export function resizeWidget(layout: readonly Widget[], type: WidgetType): Widget[] {
  return layout.map((w) => (w.type === type ? { ...w, size: w.size === "half" ? "full" : "half" } : w));
}

/** Widgets not on the dashboard yet. */
export function hiddenWidgets(layout: readonly Widget[]): WidgetType[] {
  return WIDGET_TYPES.filter((t) => !layout.some((w) => w.type === t));
}

/**
 * Where a chart drills to: the transactions page, filtered to what was
 * clicked and the dates shown; null where the workspace has no such page.
 */
export function drillHref(transactionsHref: string | null, filters: { category?: string; merchant?: string; from: string; to: string }): string | null {
  if (!transactionsHref) return null;
  return `${transactionsHref}?${filtersToQuery(filters)}`;
}
