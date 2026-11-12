import { describe, expect, it } from "vitest";
import { cleanMerchant, merchantKey, normalizeTags, parseTagInput } from "@/src/core/labels";

describe("tags", () => {
  it("are lowercase words without #, each once", () => {
    expect(normalizeTags(["#Trip", "trip", " Work ", "road trip", ""])).toEqual(["trip", "work", "road-trip"]);
    expect(parseTagInput("#trip, work  food")).toEqual(["#trip", "work", "food"]);
  });

  it("refuse too many or too long", () => {
    expect(() => normalizeTags(Array.from({ length: 11 }, (_, i) => `t${i}`))).toThrow("up to 10 tags");
    expect(() => normalizeTags(["x".repeat(31)])).toThrow("up to 30 characters");
  });
});

describe("merchants", () => {
  it("group regardless of case and spacing", () => {
    expect(cleanMerchant("  Blue  Bottle Coffee ")).toBe("Blue Bottle Coffee");
    expect(merchantKey("Blue Bottle  coffee")).toBe(merchantKey("blue bottle Coffee"));
    expect(cleanMerchant("   ")).toBeNull();
    expect(merchantKey(null)).toBeNull();
  });
});
