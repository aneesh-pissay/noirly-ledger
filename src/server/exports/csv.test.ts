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
    expect(CSV_HEADER.endsWith("merchant,tags,project")).toBe(true);
    expect(line.endsWith("Blue Bottle,work trip,Offsite")).toBe(true);
  });
});
