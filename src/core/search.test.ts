import { describe, expect, it } from "vitest";
import { escapeRegex, filtersFromParams, filtersToQuery, parseSearch, sameFilters } from "@/src/core/search";

describe("parseSearch", () => {
  it("reads text, and an amount when it looks like one", () => {
    expect(parseSearch("  blue   bottle ")).toEqual({ text: "blue bottle", amountMinor: null });
    expect(parseSearch("450")).toEqual({ text: "450", amountMinor: 45_000 });
    expect(parseSearch("1,250.50")).toEqual({ text: "1,250.50", amountMinor: 125_050 });
    expect(parseSearch("₹ 450")).toEqual({ text: "₹ 450", amountMinor: 45_000 });
    expect(parseSearch("450 inr").amountMinor).toBe(45_000);
    expect(parseSearch("4.5.6").amountMinor).toBeNull();
    expect(parseSearch("")).toEqual({ text: null, amountMinor: null });
  });

  it("escapes text for matching", () => {
    expect(escapeRegex("a+b (c)?")).toBe("a\\+b \\(c\\)\\?");
  });
});

describe("view filters", () => {
  it("keep known, non-empty filters in a stable order", () => {
    const params = new URLSearchParams("to=2026-10-31&q=coffee&junk=1&type=expense&min=");
    const filters = filtersFromParams(params);
    expect(filters).toEqual({ q: "coffee", type: "expense", to: "2026-10-31" });
    expect(filtersToQuery(filters)).toBe("q=coffee&type=expense&to=2026-10-31");
    expect(sameFilters(filters, { to: "2026-10-31", type: "expense", q: "coffee" })).toBe(true);
    expect(sameFilters(filters, { q: "coffee" })).toBe(false);
  });
});
