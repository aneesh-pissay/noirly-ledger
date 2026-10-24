import { describe, expect, it } from "vitest";
import { confidentMatch, guessFromFileName, rankMatches, type MatchCandidate } from "@/src/core/receipts";

describe("receipt file names", () => {
  it.each([
    ["2026-10-01 Swiggy 450.pdf", { date: "2026-10-01", amountMinor: 45_000, merchant: "Swiggy" }],
    ["IMG_20261001_093212.jpg", { date: "2026-10-01", amountMinor: null, merchant: null }],
    ["BigBasket_Rs1,249.50_05-10-2026.png", { date: "2026-10-05", amountMinor: 124_950, merchant: "BigBasket" }],
    ["receipt dmart 812.40.jpg", { date: null, amountMinor: 81_240, merchant: "dmart" }],
    ["Invoice 3 Oct 2026 Croma ₹ 15,999.webp", { date: "2026-10-03", amountMinor: 1_599_900, merchant: "Croma" }],
    ["scan.pdf", { date: null, amountMinor: null, merchant: null }],
  ])("reads %s", (name, expected) => {
    expect(guessFromFileName(name)).toEqual(expected);
  });
});

describe("matching receipts to transactions", () => {
  const txn = (id: string, patch: Partial<MatchCandidate>): MatchCandidate => ({
    id, type: "expense", amountMinor: 45_000, currency: "INR", date: "2026-10-01", merchant: null, note: null, hasReceipt: false, ...patch,
  });
  const receipt = { date: "2026-10-01", amountMinor: 45_000, currency: null, merchant: "Swiggy" };

  it("needs the same amount, within a few days, and never a transfer", () => {
    const ranked = rankMatches(receipt, [
      txn("far", { date: "2026-10-09" }),
      txn("other", { amountMinor: 45_100 }),
      txn("move", { type: "transfer" }),
      txn("near", { date: "2026-10-03" }),
      txn("same", {}),
    ]);
    expect(ranked.map((t) => t.id)).toEqual(["same", "near"]);
    expect(rankMatches({ ...receipt, amountMinor: null }, [txn("same", {})])).toEqual([]);
  });

  it("ranks the shop's name and a missing receipt above a closer date", () => {
    const ranked = rankMatches(receipt, [txn("plain", {}), txn("named", { date: "2026-10-02", merchant: "Swiggy" }), txn("done", { hasReceipt: true })]);
    expect(ranked.map((t) => t.id)).toEqual(["named", "plain", "done"]);
  });

  it("matches on its own only when one stands out", () => {
    expect(confidentMatch(receipt, [txn("only", {})])?.id).toBe("only");
    expect(confidentMatch(receipt, [txn("a", {}), txn("b", { merchant: "Swiggy" })])?.id).toBe("b");
    expect(confidentMatch({ ...receipt, merchant: null }, [txn("a", {}), txn("b", {})])).toBeNull();
    expect(confidentMatch(receipt, [txn("a", { hasReceipt: true })])).toBeNull();
  });
});
