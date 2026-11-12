import { describe, expect, it } from "vitest";
import { allocationProblem, expectedShares, NO_ALLOCATION, standings } from "./pool-contributions";

describe("pool allocations", () => {
  it("splits equally, leftover cents to the first members", () => {
    const shares = expectedShares({ mode: "equal", targetMinor: null, shares: [{ userId: "a", value: 0 }, { userId: "b", value: 0 }, { userId: "c", value: 0 }] }, 10_000);
    expect(Object.fromEntries(shares)).toEqual({ a: 3334, b: 3333, c: 3333 });
  });

  it("splits by percentage of a set target, or fixed amounts", () => {
    expect(Object.fromEntries(expectedShares({ mode: "percent", targetMinor: 20_000, shares: [{ userId: "a", value: 7_500 }, { userId: "b", value: 2_500 }] }, 1))).toEqual({ a: 15_000, b: 5_000 });
    expect(Object.fromEntries(expectedShares({ mode: "amount", targetMinor: null, shares: [{ userId: "a", value: 4_000 }] }, 1))).toEqual({ a: 4_000 });
    expect(expectedShares(NO_ALLOCATION, 10_000).size).toBe(0);
  });

  it("says who still owes what, those behind first", () => {
    const rows = standings(new Map([["a", 5_000], ["b", 5_000]]), new Map([["a", 5_500], ["b", 2_000], ["c", 1_000]]));
    expect(rows).toEqual([
      { userId: "b", expectedMinor: 5_000, contributedMinor: 2_000, owesMinor: 3_000 },
      { userId: "a", expectedMinor: 5_000, contributedMinor: 5_500, owesMinor: 0 },
      { userId: "c", expectedMinor: null, contributedMinor: 1_000, owesMinor: null },
    ]);
  });

  it("checks allocations", () => {
    expect(allocationProblem(NO_ALLOCATION)).toBeNull();
    expect(allocationProblem({ mode: "equal", targetMinor: null, shares: [] })).toMatch(/who shares/);
    expect(allocationProblem({ mode: "percent", targetMinor: null, shares: [{ userId: "a", value: 6_000 }, { userId: "b", value: 3_000 }] })).toMatch(/100%/);
    expect(allocationProblem({ mode: "amount", targetMinor: null, shares: [{ userId: "a", value: 1 }, { userId: "a", value: 2 }] })).toMatch(/once/);
  });
});
