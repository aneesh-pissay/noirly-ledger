import { describe, expect, it } from "vitest";
import { nextCharge, spotSubscriptions, subscriptionKey, type SpendRecord } from "@/src/core/subscriptions";

let n = 0;
const charge = (date: string, amountMinor: number, merchant: string | null, note: string | null = null, currency = "INR"): SpendRecord => ({
  id: `t${++n}`, date, amountMinor, currency, merchant, note,
});
const today = "2026-10-26";

describe("spotting subscriptions", () => {
  it("groups by merchant, else by the note's words", () => {
    expect(subscriptionKey({ merchant: "Netflix ", note: null })).toBe("m:netflix");
    expect(subscriptionKey({ merchant: null, note: "UPI/SPOTIFY/428512345678" })).toBe("n:spotify");
    expect(subscriptionKey({ merchant: null, note: "1234" })).toBeNull();
  });

  it("finds a monthly charge, with its price rise, and leaves out a one-off at the same shop", () => {
    const found = spotSubscriptions(
      [
        charge("2026-07-05", 64_900, "Netflix"),
        charge("2026-08-05", 64_900, "Netflix"),
        charge("2026-08-19", 1_200_000, "Netflix"),
        charge("2026-09-04", 64_900, "Netflix"),
        charge("2026-10-05", 79_900, "Netflix"),
      ],
      today,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      key: "m:netflix", name: "Netflix", cadence: "monthly", count: 4, typicalMinor: 64_900, lastMinor: 79_900, previousMinor: 64_900,
      monthlyMinor: 64_900, firstDate: "2026-07-05", lastDate: "2026-10-05", nextDate: "2026-11-05", active: true,
    });
  });

  it("tells weekly, quarterly and yearly apart, and costs them by the month", () => {
    const found = spotSubscriptions(
      [
        ...["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"].map((d) => charge(d, 6_000, "Milk")),
        ...["2026-01-10", "2026-04-10", "2026-07-11"].map((d) => charge(d, 300_000, null, "Broadband quarterly")),
        ...["2024-11-02", "2025-11-01"].map((d) => charge(d, 120_000, "Domain")),
      ],
      today,
    );
    expect(found.map((s) => [s.name, s.cadence, s.monthlyMinor, s.active])).toEqual([
      ["Broadband Quarterly", "quarterly", 100_000, true],
      ["Milk", "weekly", 26_000, true],
      ["Domain", "yearly", 10_000, true],
    ]);
  });

  it("needs a steady rhythm and enough charges, and marks one that stopped", () => {
    expect(spotSubscriptions(["2026-08-01", "2026-09-01"].map((d) => charge(d, 50_000, "Gym")), today)).toEqual([]);
    expect(spotSubscriptions(["2026-06-01", "2026-06-20", "2026-08-30"].map((d) => charge(d, 50_000, "Cafe")), today)).toEqual([]);
    const stopped = spotSubscriptions(["2026-03-01", "2026-04-01", "2026-05-01"].map((d) => charge(d, 50_000, "Gym")), today);
    expect(stopped.map((s) => s.active)).toEqual([false]);
  });

  it("knows when the next charge falls", () => {
    expect(nextCharge("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextCharge("2026-10-19", "weekly")).toBe("2026-10-26");
    expect(nextCharge("2026-07-11", "quarterly")).toBe("2026-10-11");
  });
});
