import { describe, expect, it } from "vitest";
import { CSV_HEADER, transactionToCsvRow } from "./csv";

describe("transactionToCsvRow", () => {
  it("emits decimal amounts with an explicit currency column", () => {
    const line = transactionToCsvRow({
      date: "2026-01-02",
      type: "expense",
      amountMinor: 1234,
      currency: "USD",
      baseAmountMinor: 1234,
      category: "Food",
      pool: "",
      note: "Lunch, cafe",
      status: "posted",
      createdBy: "Ada",
      merchant: "Blue Bottle",
      tags: "work trip",
      project: "Offsite",
    });
    expect(CSV_HEADER).toContain("currency");
    expect(line).toContain("12.34");
    expect(line).toContain("USD");
    expect(line).toContain('"Lunch, cafe"');
    expect(CSV_HEADER.endsWith("merchant,tags,project,gst_rate,taxable_value,cgst,sgst,igst,gstin,hsn_sac")).toBe(true);
    expect(line.endsWith("Blue Bottle,work trip,Offsite,,,,,,,")).toBe(true);
    const taxed = transactionToCsvRow({
      date: "2026-01-02", type: "expense", amountMinor: 118_000, currency: "INR", baseAmountMinor: 1_416, category: "", pool: "", note: "", status: "posted", createdBy: "Ada", merchant: "", tags: "", project: "",
      gst: { ratePct: 18, taxableMinor: 100_000, cgstMinor: 9_000, sgstMinor: 9_000, igstMinor: 0, gstin: "27AAPFU0939F1ZV", hsn: "998311" },
    });
    expect(taxed.endsWith("18,1000.00,90.00,90.00,0.00,27AAPFU0939F1ZV,998311")).toBe(true);
  });
});
