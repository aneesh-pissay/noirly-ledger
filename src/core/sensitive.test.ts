import { describe, expect, it } from "vitest";
import { lastFour, maskAccountNumber, normalizeAccountNumber, noteTerms, searchTerms } from "./sensitive";

describe("sensitive data", () => {
  it("normalizes and masks account numbers", () => {
    expect(normalizeAccountNumber("5010 0123-4567 89")).toBe("50100123456789");
    expect(normalizeAccountNumber("gb82 west 1234 5698 7654 32")).toBe("GB82WEST12345698765432");
    expect(normalizeAccountNumber("12")).toBeNull();
    expect(normalizeAccountNumber("12#34")).toBeNull();
    expect(lastFour("50100123456789")).toBe("6789");
    expect(maskAccountNumber("6789")).toBe("•••• 6789");
    expect(maskAccountNumber(null)).toBeNull();
  });

  it("indexes word beginnings, accents and case aside", () => {
    expect(noteTerms("Café run")).toEqual(["ca", "caf", "cafe", "ru", "run"]);
    expect(noteTerms("a I x")).toEqual([]);
    expect(noteTerms("Subscriptionsforever")).toContain("subscription");
    expect(noteTerms("Subscriptionsforever")).not.toContain("subscriptions");
    expect(noteTerms(null)).toEqual([]);
  });

  it("searches for every word's beginning", () => {
    expect(searchTerms("Weekly  GROC")).toEqual(["weekly", "groc"]);
    expect(searchTerms("subscriptionsforever")).toEqual(["subscription"]);
    // Every search term is among a matching note's terms.
    const terms = new Set(noteTerms("Weekly groceries at the market"));
    expect(searchTerms("week groc").every((t) => terms.has(t))).toBe(true);
    expect(searchTerms("grocx").every((t) => terms.has(t))).toBe(false);
  });
});
