import { describe, expect, it } from "vitest";
import { clearingOf, reconcileGap, reconciledChange } from "@/src/core/clearing";

describe("clearing", () => {
  it("treats older transactions without a state as cleared", () => {
    expect(clearingOf(undefined)).toBe("cleared");
    expect(clearingOf(null)).toBe("cleared");
    expect(clearingOf("pending")).toBe("pending");
    expect(clearingOf("reconciled")).toBe("reconciled");
  });

  it("keeps what a reconciled transaction was matched on", () => {
    const current = { amountMinor: 500, date: "2026-10-01", accountId: "a", currency: "USD" };
    expect(reconciledChange("reconciled", current, { amountMinor: 600 })).toBe("amountMinor");
    expect(reconciledChange("reconciled", current, { date: "2026-10-02" })).toBe("date");
    expect(reconciledChange("reconciled", current, { accountId: null })).toBe("accountId");
    // Sending the same values, or changing a note or category, is fine.
    expect(reconciledChange("reconciled", current, { amountMinor: 500, currency: "USD" })).toBeNull();
    expect(reconciledChange("reconciled", current, {})).toBeNull();
    expect(reconciledChange("cleared", current, { amountMinor: 600 })).toBeNull();
  });

  it("measures the gap to the statement", () => {
    expect(reconcileGap(10_000, 10_000)).toBe(0);
    expect(reconcileGap(10_000, 9_550)).toBe(-450);
  });
});
