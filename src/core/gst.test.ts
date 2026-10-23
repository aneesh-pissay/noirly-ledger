import { describe, expect, it } from "vitest";
import { checkGstSettings, gstAmounts, gstinCheckChar, gstSummary, normalizeGstin, normalizeHsn, withGst } from "@/src/core/gst";

describe("gstAmounts", () => {
  it("takes the tax out of an amount that includes it, split by supply", () => {
    // 1,180 at 18% is 1,000 plus 180 of tax.
    expect(gstAmounts(118_000, { ratePct: 18, treatment: "taxable", supply: "intra" })).toEqual({ taxableMinor: 100_000, cgstMinor: 9_000, sgstMinor: 9_000, igstMinor: 0, taxMinor: 18_000 });
    expect(gstAmounts(118_000, { ratePct: 18, treatment: "taxable", supply: "inter" })).toEqual({ taxableMinor: 100_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 18_000, taxMinor: 18_000 });
  });

  it("keeps every paisa, splitting an odd tax unevenly", () => {
    const amounts = gstAmounts(10_001, { ratePct: 5, treatment: "taxable", supply: "intra" });
    expect(amounts.taxableMinor + amounts.taxMinor).toBe(10_001);
    expect(amounts.cgstMinor + amounts.sgstMinor).toBe(amounts.taxMinor);
  });

  it("has no tax on exempt or outside-GST supplies", () => {
    expect(gstAmounts(5_000, { ratePct: 0, treatment: "exempt", supply: "intra" })).toMatchObject({ taxableMinor: 5_000, taxMinor: 0 });
    expect(withGst(100_000, 18)).toBe(118_000);
  });
});

describe("GSTIN", () => {
  it("checks shape and check character", () => {
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
    expect(normalizeGstin(" 27aapfu0939f1zv ")).toBe("27AAPFU0939F1ZV");
    expect(() => normalizeGstin("27AAPFU0939F1ZX")).toThrow("doesn't check out");
    expect(() => normalizeGstin("27AAPFU0939")).toThrow("15 characters");
    expect(normalizeGstin("")).toBeNull();
  });

  it("checks HSN and SAC codes and rates", () => {
    expect(normalizeHsn("9983 11")).toBe("998311");
    expect(() => normalizeHsn("12")).toThrow();
    expect(checkGstSettings({ ratePct: 18, treatment: "taxable", supply: "intra" })).toEqual({ ok: true });
    expect(checkGstSettings({ ratePct: 15, treatment: "taxable", supply: "intra" }).ok).toBe(false);
    expect(checkGstSettings({ ratePct: 5, treatment: "exempt", supply: "intra" }).ok).toBe(false);
  });
});

describe("gstSummary", () => {
  it("adds up tax paid and collected by rate, less refunds, and what can be claimed", () => {
    const gst = (amount: number, ratePct: number, itcEligible = false) => ({ ...gstAmounts(amount, { ratePct, treatment: "taxable", supply: "intra" }), ratePct, treatment: "taxable" as const, itcEligible });
    const [inr] = gstSummary([
      { type: "expense", currency: "INR", gst: gst(118_000, 18, true) },
      { type: "refund", currency: "INR", gst: gst(11_800, 18, true) },
      { type: "expense", currency: "INR", gst: gst(10_500, 5) },
      { type: "income", currency: "INR", gst: gst(236_000, 18) },
      { type: "expense", currency: "INR", gst: null },
    ]);
    expect(inr!.paid).toEqual({ taxableMinor: 100_000, cgstMinor: 8_350, sgstMinor: 8_350, igstMinor: 0, taxMinor: 16_700 });
    expect(inr!.collected.taxMinor).toBe(36_000);
    expect(inr!.itcMinor).toBe(16_200);
    expect(inr!.byRate.map((r) => r.ratePct)).toEqual([5, 18]);
  });
});
