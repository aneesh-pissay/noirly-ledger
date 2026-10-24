import { describe, expect, it } from "vitest";
import { duplicatePairs, duplicateReason, similarText, type DuplicateCandidate } from "@/src/core/duplicates";

const base: DuplicateCandidate = { type: "expense", amountMinor: 45_000, currency: "INR", date: "2026-10-01", accountId: "a1", text: "Swiggy", upiRef: null };
const at = (patch: Partial<DuplicateCandidate>) => ({ ...base, ...patch });

describe("duplicate transactions", () => {
  it("matches descriptions by their words, not reference numbers", () => {
    expect(similarText("UPI-SWIGGY-428512345678", "Swiggy dinner")).toBe(true);
    expect(similarText("Swiggy", "Zomato")).toBe(false);
    expect(similarText("", "Swiggy")).toBe(false);
  });

  it("same amount on the same day is a duplicate, whatever the description", () => {
    expect(duplicateReason(base, at({ text: "Dinner" }))).toBe("same-day");
    expect(duplicateReason(base, at({ accountId: null }))).toBe("same-day");
  });

  it("a few days apart needs a matching description", () => {
    expect(duplicateReason(base, at({ date: "2026-10-03", text: "UPI/SWIGGY/1234" }))).toBe("nearby");
    expect(duplicateReason(base, at({ date: "2026-10-03", text: "Groceries" }))).toBeNull();
    expect(duplicateReason(base, at({ date: "2026-10-06" }))).toBeNull();
  });

  it("other kind, amount, currency or account is not", () => {
    expect(duplicateReason(base, at({ type: "income" }))).toBeNull();
    expect(duplicateReason(base, at({ amountMinor: 45_001 }))).toBeNull();
    expect(duplicateReason(base, at({ currency: "USD" }))).toBeNull();
    expect(duplicateReason(base, at({ accountId: "a2" }))).toBeNull();
  });

  it("the same UPI reference always is", () => {
    expect(duplicateReason(at({ upiRef: "428512345678" }), at({ upiRef: "428512345678", amountMinor: 1, date: "2026-12-01" }))).toBe("upi");
  });

  it("lists each pair once, newest first, leaving out dismissed ones", () => {
    const items = [
      { ...base, id: "t1" },
      { ...base, id: "t2", text: "Swiggy order" },
      { ...base, id: "t3", date: "2026-10-20" },
      { ...base, id: "t4", date: "2026-10-21", text: "swiggy" },
      { ...base, id: "t5", amountMinor: 900, upiRef: "111122223333" },
      { ...base, id: "t6", amountMinor: 901, upiRef: "111122223333" },
    ];
    expect(duplicatePairs(items).map((p) => [p.first.id, p.second.id, p.reason])).toEqual([
      ["t3", "t4", "nearby"],
      ["t1", "t2", "same-day"],
      ["t5", "t6", "upi"],
    ]);
    expect(duplicatePairs(items, (a, b) => a === "t1" && b === "t2").map((p) => p.second.id)).toEqual(["t4", "t6"]);
  });
});
