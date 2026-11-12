import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blindTerm, blindTerms, isSealed, openField, sealField, UNREADABLE } from "./field-crypto";
import { searchTerms } from "@/src/core/sensitive";

describe("sealed fields", () => {
  const before = process.env.LEDGER_SECRET_KEY;
  beforeEach(() => {
    process.env.LEDGER_SECRET_KEY = "k".repeat(32);
  });
  afterEach(() => {
    process.env.LEDGER_SECRET_KEY = before;
  });

  it("seals once, opens back, and passes empty and plain values through", () => {
    const sealed = sealField("Dinner with Asha");
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("Asha");
    expect(sealField(sealed)).toBe(sealed);
    expect(openField(sealed)).toBe("Dinner with Asha");
    expect(sealField(null)).toBeNull();
    expect(sealField("")).toBe("");
    expect(openField("an old plain note")).toBe("an old plain note");
  });

  it("says so, rather than failing, when the key has changed", () => {
    const sealed = sealField("secret");
    process.env.LEDGER_SECRET_KEY = "j".repeat(32);
    expect(openField(sealed)).toBe(UNREADABLE);
  });

  it("finds a note by its words' beginnings without storing them", () => {
    const stored = new Set(blindTerms("Weekly groceries at the market"));
    expect([...stored].some((t) => t.includes("groc"))).toBe(false);
    expect(searchTerms("groc week").map(blindTerm).every((t) => stored.has(t))).toBe(true);
    expect(searchTerms("grocx").map(blindTerm).every((t) => stored.has(t))).toBe(false);
    // Another key, other hashes: they're of no use without it.
    process.env.LEDGER_SECRET_KEY = "j".repeat(32);
    expect(stored.has(blindTerm("groc"))).toBe(false);
  });
});
