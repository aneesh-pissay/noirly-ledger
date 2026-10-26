import { describe, expect, it } from "vitest";
import { needsReview, priceRise, serviceGroup, subscriptionInsights, type SubscriptionSeries } from "@/src/core/subscription-insights";

const today = "2026-10-26";
const series = (patch: Partial<SubscriptionSeries>): SubscriptionSeries => ({
  key: "m:netflix",
  name: "Netflix",
  currency: "INR",
  cadence: "monthly",
  charges: [{ date: "2026-08-05", amountMinor: 64_900 }, { date: "2026-09-05", amountMinor: 64_900 }],
  monthlyMinor: 64_900,
  nextDate: "2026-11-05",
  ruleId: null,
  reviewedOn: null,
  ...patch,
});

describe("subscription insights", () => {
  it("notices a price rise from one charge to the next, not a rounding change", () => {
    expect(priceRise(series({ charges: [{ date: "2026-09-05", amountMinor: 64_900 }, { date: "2026-10-05", amountMinor: 79_900 }] }))).toMatchObject({
      kind: "price", fromMinor: 64_900, toMinor: 79_900, percent: 23, on: "2026-10-05", id: "price:m:netflix:2026-10-05",
    });
    expect(priceRise(series({ charges: [{ date: "2026-09-05", amountMinor: 64_900 }, { date: "2026-10-05", amountMinor: 65_000 }] }))).toBeNull();
    expect(priceRise(series({ charges: [{ date: "2026-10-05", amountMinor: 79_900 }] }))).toBeNull();
  });

  it("knows which services do the same job", () => {
    expect(serviceGroup("Spotify")).toBe("music streaming");
    expect(serviceGroup("YOUTUBE MUSIC")).toBe("music streaming");
    expect(serviceGroup("Disney+ Hotstar")).toBe("video streaming");
    expect(serviceGroup("Gym")).toBeNull();
  });

  it("flags the same bill set up twice and two services of one kind", () => {
    const insights = subscriptionInsights(
      [
        series({ ruleId: "r1" }),
        series({ ruleId: "r2" }),
        series({ key: "m:spotify", name: "Spotify", monthlyMinor: 11_900, ruleId: "r3" }),
        series({ key: "n:music youtube", name: "Youtube Music", monthlyMinor: 9_900 }),
      ],
      today,
    ).filter((i) => i.kind === "duplicate");
    expect(insights.map((i) => i.kind === "duplicate" && [i.names, i.group, i.monthlyMinor, i.ruleIds])).toEqual([
      [["Netflix", "Netflix"], null, 129_800, ["r1", "r2"]],
      [["Spotify", "Youtube Music"], "music streaming", 21_800, ["r3"]],
    ]);
  });

  it("asks about a tracked one before its next charge, at most twice a year", () => {
    const tracked = series({ ruleId: "r1", cadence: "yearly", charges: [{ date: "2025-11-01", amountMinor: 99_900 }], nextDate: "2026-11-01" });
    expect(needsReview(tracked, today)).toMatchObject({ kind: "review", yearlyMinor: 99_900, nextDate: "2026-11-01", ruleId: "r1" });
    expect(needsReview({ ...tracked, reviewedOn: "2026-06-01" }, today)).toBeNull();
    expect(needsReview({ ...tracked, reviewedOn: "2026-03-01" }, today)).not.toBeNull();
    expect(needsReview({ ...tracked, nextDate: "2026-12-01" }, today)).toBeNull();
    expect(needsReview({ ...tracked, ruleId: null }, today)).toBeNull();
    expect(needsReview({ ...tracked, charges: [{ date: "2026-10-01", amountMinor: 99_900 }] }, today)).toBeNull();
  });
});
