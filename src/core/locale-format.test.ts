import { describe, expect, it } from "vitest";
import { defaultFiscalStart, fiscalYear, formatGrouped, formatMoney } from "@/src/core/locale-format";

describe("formatGrouped", () => {
  it("groups rupees in lakh and crore by default", () => {
    expect(formatGrouped(123_456_789_00, "INR")).toBe("12,34,56,789.00");
    expect(formatGrouped(10_000_000, "INR")).toBe("1,00,000.00");
    expect(formatGrouped(99_999, "INR")).toBe("999.99");
    expect(formatGrouped(-12_345_678, "inr")).toBe("-1,23,456.78");
  });

  it("groups other currencies in thousands, unless asked otherwise", () => {
    expect(formatGrouped(123_456_789, "USD")).toBe("1,234,567.89");
    expect(formatGrouped(123_456_789, "USD", "indian")).toBe("12,34,567.89");
    expect(formatGrouped(123_456_789, "INR", "international")).toBe("1,234,567.89");
    expect(formatGrouped(5, "USD")).toBe("0.05");
  });

  it("shows the currency code after", () => {
    expect(formatMoney(150_000_00, "INR")).toBe("1,50,000.00 INR");
  });
});

describe("fiscalYear", () => {
  it("runs April to March in India", () => {
    expect(fiscalYear("2026-10-22", 4)).toEqual({ from: "2026-04-01", to: "2027-03-31", label: "FY 2026–27" });
    expect(fiscalYear("2027-02-10", 4)).toEqual({ from: "2026-04-01", to: "2027-03-31", label: "FY 2026–27" });
    expect(fiscalYear("2026-04-01", 4, -1)).toEqual({ from: "2025-04-01", to: "2026-03-31", label: "FY 2025–26" });
    expect(fiscalYear("2099-06-01", 4).label).toBe("FY 2099–00");
  });

  it("works for any start month, January being the calendar year", () => {
    expect(fiscalYear("2026-10-22", 1)).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "FY 2026" });
    expect(fiscalYear("2026-03-15", 7)).toEqual({ from: "2025-07-01", to: "2026-06-30", label: "FY 2025–26" });
    expect(fiscalYear("2028-02-01", 3).to).toBe("2028-02-29");
    expect(fiscalYear("2028-02-01", 3, -1).to).toBe("2027-02-28");
  });

  it("starts in April for rupee workspaces unless set", () => {
    expect(defaultFiscalStart("INR")).toBe(4);
    expect(defaultFiscalStart("USD")).toBe(1);
  });
});

describe("chart ticks", () => {
  it("show whole units of the currency", () => {
    // Axes get minor units; rounding to whole units first keeps 40,000.00 reading as 40,000.
    expect(formatGrouped(Math.round(4_000_000 / 100), "USD", "auto", 0)).toBe("40,000");
    expect(formatGrouped(Math.round(1_234_567_00 / 100), "INR", "auto", 0)).toBe("12,34,567");
  });
});
