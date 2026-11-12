import { describe, expect, it } from "vitest";
import { formatUpiRef, normalizeUpiId, normalizeUpiRef, upiPayLink } from "@/src/core/upi";

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

describe("UPI payment links", () => {
  it("fills in the payee, amount in rupees and a note", () => {
    expect(upiPayLink({ upiId: "bescom@okaxis", payeeName: "BESCOM Electricity", amountMinor: 184_050, note: "Bill for Oct & Nov" })).toBe(
      "upi://pay?pa=bescom@okaxis&pn=BESCOM%20Electricity&am=1840.50&cu=INR&tn=Bill%20for%20Oct%20%26%20Nov",
    );
  });

  it("leaves out what isn't known, and opens one app when asked", () => {
    expect(upiPayLink({ upiId: "rent.owner@ybl" }, "phonepe")).toBe("phonepe://pay?pa=rent.owner@ybl&cu=INR");
    expect(upiPayLink({ upiId: "a@b", amountMinor: 5_000 }, "gpay")).toBe("tez://upi/pay?pa=a@b&am=50.00&cu=INR");
  });
});
