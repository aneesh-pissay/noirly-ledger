import { describe, expect, it } from "vitest";
import { owedByClaimant, payoutProblem, statusAfter } from "./reimbursements";

const r = (id: string, claimantId: string, status: "pending" | "owed" | "paid" | "void", amountMinor = 1000) => ({
  id,
  claimantId,
  claimantName: claimantId.toUpperCase(),
  status,
  amountMinor,
});

describe("reimbursements", () => {
  it("is owed once approved, void otherwise", () => {
    expect(statusAfter("approved")).toBe("owed");
    expect(statusAfter("rejected")).toBe("void");
    expect(statusAfter("withdrawn")).toBe("void");
  });

  it("totals what's owed per person, largest first, ignoring the rest", () => {
    const rows = owedByClaimant([r("1", "mel", "owed", 500), r("2", "ben", "owed", 2000), r("3", "mel", "owed", 700), r("4", "mel", "paid"), r("5", "ben", "pending")]);
    expect(rows).toEqual([
      { claimantId: "ben", claimantName: "BEN", totalMinor: 2000, ids: ["2"] },
      { claimantId: "mel", claimantName: "MEL", totalMinor: 1200, ids: ["1", "3"] },
    ]);
  });

  it("pays out only what's owed, to one person, each once", () => {
    expect(payoutProblem([], [])).toMatch(/at least one/);
    expect(payoutProblem([r("1", "mel", "owed")], ["1", "1"])).toMatch(/once/);
    expect(payoutProblem([r("1", "mel", "owed")], ["1", "x"])).toMatch(/aren't in/);
    expect(payoutProblem([r("1", "mel", "owed"), r("2", "mel", "pending")], ["1", "2"])).toMatch(/owed/);
    expect(payoutProblem([r("1", "mel", "owed"), r("2", "ben", "owed")], ["1", "2"])).toMatch(/one person/);
    expect(payoutProblem([r("1", "mel", "owed"), r("2", "mel", "owed")], ["1", "2"])).toBeNull();
  });
});
