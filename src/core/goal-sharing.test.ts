import { describe, expect, it } from "vitest";
import { memberShares, pledgedMonthly, pledgeStatus } from "@/src/core/goal-sharing";

const today = "2026-10-28";

describe("saving together", () => {
  const contributions = [
    { userId: "asha", date: "2026-09-05", amountMinor: 30_000 },
    { userId: "ravi", date: "2026-09-10", amountMinor: 10_000 },
    { userId: "asha", date: "2026-10-05", amountMinor: 10_000 },
    { userId: "ravi", date: "2026-10-20", amountMinor: 5_000 },
    { userId: "kid", date: "2026-10-21", amountMinor: 2_000 },
    { userId: "kid", date: "2026-10-22", amountMinor: -2_000 },
  ];

  it("shows each member's share, leaving out anyone at nothing", () => {
    expect(memberShares(contributions)).toEqual([
      { userId: "asha", amountMinor: 40_000, percent: 73 },
      { userId: "ravi", amountMinor: 15_000, percent: 27 },
    ]);
  });

  it("checks pledges against this month", () => {
    expect(pledgeStatus([{ userId: "asha", monthlyMinor: 10_000 }, { userId: "ravi", monthlyMinor: 10_000 }, { userId: "kid", monthlyMinor: 0 }], contributions, today)).toEqual([
      { userId: "asha", monthlyMinor: 10_000, thisMonthMinor: 10_000, met: true },
      { userId: "ravi", monthlyMinor: 10_000, thisMonthMinor: 5_000, met: false },
    ]);
    expect(pledgedMonthly([{ monthlyMinor: 10_000 }, { monthlyMinor: 10_000 }, { monthlyMinor: 0 }])).toBe(20_000);
  });
});
