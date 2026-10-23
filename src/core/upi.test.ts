import { describe, expect, it } from "vitest";
import { formatUpiRef, normalizeUpiId, normalizeUpiRef } from "@/src/core/upi";

describe("UPI reference", () => {
  it("is 12 digits, however it's spaced", () => {
    expect(normalizeUpiRef("4321 5678 9012")).toBe("432156789012");
    expect(normalizeUpiRef("4321-5678-9012")).toBe("432156789012");
    expect(normalizeUpiRef("  ")).toBeNull();
    expect(() => normalizeUpiRef("12345")).toThrow("12 digits");
    expect(() => normalizeUpiRef("43215678901A")).toThrow("12 digits");
    expect(formatUpiRef("432156789012")).toBe("4321 5678 9012");
  });
});

describe("UPI ID", () => {
  it("looks like name@bank", () => {
    expect(normalizeUpiId(" Ravi.K@OKHDFC ")).toBe("ravi.k@okhdfc");
    expect(normalizeUpiId("9876543210@ybl")).toBe("9876543210@ybl");
    expect(normalizeUpiId("")).toBeNull();
    expect(() => normalizeUpiId("ravi")).toThrow("name@bank");
    expect(() => normalizeUpiId("ravi@")).toThrow();
  });
});
