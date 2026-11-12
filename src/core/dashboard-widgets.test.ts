import { describe, expect, it } from "vitest";
import { addWidget, DEFAULT_LAYOUT, drillHref, hiddenWidgets, moveWidget, normalizeLayout, removeWidget, resizeWidget } from "./dashboard-widgets";

describe("dashboard layout", () => {
  it("starts from the default, and keeps only known widgets, once each", () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout([{ type: "budgets", size: "full" }, { type: "nonsense" }, { type: "budgets", size: "half" }, { type: "net-worth", size: "huge" }])).toEqual([
      { type: "budgets", size: "full" },
      { type: "net-worth", size: "half" },
    ]);
    expect(normalizeLayout([])).toEqual([]);
  });

  it("moves, removes, adds and resizes", () => {
    const layout = [{ type: "summary", size: "full" }, { type: "budgets", size: "half" }] as const;
    expect(moveWidget(layout, 1, -1).map((w) => w.type)).toEqual(["budgets", "summary"]);
    expect(moveWidget(layout, 0, -1).map((w) => w.type)).toEqual(["summary", "budgets"]);
    expect(removeWidget(layout, "summary").map((w) => w.type)).toEqual(["budgets"]);
    expect(addWidget(layout, "net-worth").at(-1)).toEqual({ type: "net-worth", size: "half" });
    expect(addWidget(layout, "budgets")).toHaveLength(2);
    expect(resizeWidget(layout, "budgets")[1]).toEqual({ type: "budgets", size: "full" });
    expect(hiddenWidgets(layout)).toEqual(["income-expense", "categories", "merchants", "net-worth", "cash-flow"]);
  });
});

describe("drill-down", () => {
  it("opens the transactions behind what was clicked, over the dates shown", () => {
    expect(drillHref("/transactions", { category: "abc", from: "2026-10-01", to: "2026-10-31" })).toBe("/transactions?category=abc&from=2026-10-01&to=2026-10-31");
    expect(drillHref("/w/x/transactions", { merchant: "Cafe One", from: "2026-10-01", to: "2026-10-31" })).toBe("/w/x/transactions?merchant=Cafe+One&from=2026-10-01&to=2026-10-31");
    expect(drillHref(null, { from: "2026-10-01", to: "2026-10-31" })).toBeNull();
  });
});
