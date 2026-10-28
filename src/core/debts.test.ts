import { describe, expect, it } from "vitest";
import { defaultCardMinimum, simulateDebts, simulatePrepayment, type Debt } from "@/src/core/debts";
import { emiAmount } from "@/src/core/installments";

const debts: Debt[] = [
  { id: "card", name: "Card", balanceMinor: 5_000_000, annualRatePct: 42, minimumMinor: 250_000 },
  { id: "car", name: "Car loan", balanceMinor: 30_000_000, annualRatePct: 9, minimumMinor: 1_000_000 },
  { id: "friend", name: "Friend", balanceMinor: 1_000_000, annualRatePct: 0, minimumMinor: 100_000 },
];

describe("paying off debt", () => {
  it("pays minimums only, slowly", () => {
    const result = simulateDebts(debts, "minimum");
    expect(result.months).not.toBeNull();
    expect(result.payoffs.map((p) => p.id)).toEqual(["friend", "card", "car"]);
    expect(result.timeline.at(-1)).toBe(0);
  });

  it("snowball clears the smallest first, avalanche the dearest, and avalanche costs least", () => {
    const snowball = simulateDebts(debts, "snowball", 500_000);
    const avalanche = simulateDebts(debts, "avalanche", 500_000);
    const minimum = simulateDebts(debts, "minimum");
    expect(snowball.payoffs[0]!.id).toBe("friend");
    expect(avalanche.payoffs[0]!.id).toBe("card");
    expect(avalanche.totalInterestMinor).toBeLessThan(snowball.totalInterestMinor);
    expect(snowball.totalInterestMinor).toBeLessThan(minimum.totalInterestMinor);
    expect(avalanche.months!).toBeLessThan(minimum.months!);
    // The same total every month, so both finish together or near it.
    expect(Math.abs(avalanche.months! - snowball.months!)).toBeLessThanOrEqual(1);
  });

  it("says when minimums never catch up with the interest", () => {
    expect(simulateDebts([{ id: "x", name: "X", balanceMinor: 1_000_000, annualRatePct: 36, minimumMinor: 20_000 }], "minimum").months).toBeNull();
  });

  it("works out a card's minimum due", () => {
    expect(defaultCardMinimum(5_000_000, "INR")).toBe(250_000);
    expect(defaultCardMinimum(100_000, "INR")).toBe(20_000);
    expect(defaultCardMinimum(10_000, "INR")).toBe(10_000);
    expect(defaultCardMinimum(100_000, "USD")).toBe(5_000);
    expect(defaultCardMinimum(2_000, "USD")).toBe(200);
  });
});

describe("prepaying a loan", () => {
  // ₹20 lakh left over 20 years at 8.5%.
  const loan = { balanceMinor: 200_000_000, annualRatePct: 8.5, emiMinor: Math.round(emiAmount(200_000_000, 240, 8.5)), monthsLeft: 240 };

  it("with no prepayment, it runs its course", () => {
    const result = simulatePrepayment(loan, { lumpSumMinor: 0, atMonth: 1, extraMonthlyMinor: 0, mode: "tenure" });
    expect(result.before.months).toBe(240);
    expect(result).toMatchObject({ savedInterestMinor: 0, savedMonths: 0 });
  });

  it("a lump sum keeping the EMI finishes years sooner", () => {
    const result = simulatePrepayment(loan, { lumpSumMinor: 20_000_000, atMonth: 1, extraMonthlyMinor: 0, mode: "tenure" });
    expect(result.savedMonths).toBeGreaterThan(36);
    expect(result.after.emiMinor).toBe(loan.emiMinor);
    expect(result.savedInterestMinor).toBeGreaterThan(30_000_000);
  });

  it("a lump sum lowering the EMI keeps the end date but saves less", () => {
    const tenure = simulatePrepayment(loan, { lumpSumMinor: 20_000_000, atMonth: 1, extraMonthlyMinor: 0, mode: "tenure" });
    const emi = simulatePrepayment(loan, { lumpSumMinor: 20_000_000, atMonth: 1, extraMonthlyMinor: 0, mode: "emi" });
    expect(emi.after.months).toBe(240);
    expect(emi.after.emiMinor).toBeLessThan(loan.emiMinor);
    expect(emi.savedInterestMinor).toBeLessThan(tenure.savedInterestMinor);
    expect(emi.savedInterestMinor).toBeGreaterThan(0);
  });

  it("a little extra every month adds up", () => {
    const result = simulatePrepayment(loan, { lumpSumMinor: 0, atMonth: 1, extraMonthlyMinor: 200_000, mode: "tenure" });
    expect(result.savedMonths).toBeGreaterThan(24);
  });
});
