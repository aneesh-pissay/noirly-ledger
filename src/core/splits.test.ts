import { describe, expect, it } from "vitest";
import { allocate, checkSplits } from "@/src/core/splits";

describe("checkSplits", () => {
  const lines = [
    { categoryId: "food", amountMinor: 3_000 },
    { categoryId: "home", amountMinor: 1_250 },
  ];

  it("accepts lines that add up to the amount", () => {
    expect(checkSplits("expense", 4_250, lines)).toEqual({ ok: true });
    expect(checkSplits("income", 4_250, lines)).toEqual({ ok: true });
  });

  it("says how far off the lines are", () => {
    expect(checkSplits("expense", 5_000, lines)).toEqual({ ok: false, error: "The lines add up to 42.50, 7.50 short of the amount" });
    expect(checkSplits("expense", 4_000, lines)).toEqual({ ok: false, error: "The lines add up to 42.50, 2.50 more than the amount" });
  });

  it("needs two or more lines in different categories, each above zero, on spending or income", () => {
    expect(checkSplits("expense", 3_000, [lines[0]!]).ok).toBe(false);
    expect(checkSplits("expense", 6_000, [lines[0]!, lines[0]!])).toEqual({ ok: false, error: "Each line needs a different category" });
    expect(checkSplits("expense", 3_000, [lines[0]!, { categoryId: "home", amountMinor: 0 }]).ok).toBe(false);
    expect(checkSplits("transfer", 4_250, lines)).toEqual({ ok: false, error: "Only expenses and income can be split" });
  });
});

describe("allocate", () => {
  it("shares in proportion and always adds up", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1_000, [3_000, 1_250])).toEqual([706, 294]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    const shares = allocate(9_999, [17, 23, 61]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(9_999);
  });

  it("copes with nothing to weigh by", () => {
    expect(allocate(50, [])).toEqual([]);
    expect(allocate(50, [0, 0])).toEqual([50, 0]);
  });
});
