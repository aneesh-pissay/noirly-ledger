import { describe, expect, it } from "vitest";
import { fixedReply, needsFetch, parseProviderReply, providerCovers, toStoredRates } from "./fx-provider";
import { FX_RATE_SCALE } from "./money";

describe("automatic FX rates", () => {
  it("turns 'one base buys X' into 'one unit is worth 1/X base'", () => {
    const { date, scaled } = toStoredRates({ base: "INR", date: "2026-10-30", rates: { USD: 0.012, EUR: 0.011, INR: 1, BAD: 0 } }, "INR");
    expect(date).toBe("2026-10-30");
    expect(scaled.get("USD")).toBe(Math.round(FX_RATE_SCALE / 0.012));
    expect(scaled.has("INR")).toBe(false);
    expect(scaled.has("BAD")).toBe(false);
    expect(() => toStoredRates({ base: "USD", date: "2026-10-30", rates: {} }, "INR")).toThrow(/not INR/);
  });

  it("reads provider replies, refusing odd ones", () => {
    expect(parseProviderReply({ amount: 1, base: "USD", date: "2026-10-30", rates: { INR: 83 } })).toEqual({ base: "USD", date: "2026-10-30", rates: { INR: 83 } });
    expect(() => parseProviderReply({ message: "not found" })).toThrow(/unexpected/);
  });

  it("fetches when there's no rate, or only an old fetched one; never over a hand-set rate", () => {
    expect(needsFetch(null, "2026-10-20", "2026-10-31")).toBe(true);
    expect(needsFetch({ effectiveFrom: "2026-10-18", source: "auto" }, "2026-10-20", "2026-10-31")).toBe(false);
    expect(needsFetch({ effectiveFrom: "2026-09-01", source: "auto" }, "2026-10-20", "2026-10-31")).toBe(true);
    expect(needsFetch({ effectiveFrom: "2026-01-01", source: "user" }, "2026-10-20", "2026-10-31")).toBe(false);
    // A future date with a rate: use what there is.
    expect(needsFetch({ effectiveFrom: "2026-09-01", source: "auto" }, "2026-12-01", "2026-10-31")).toBe(false);
  });

  it("has set cross rates for tests", () => {
    expect(fixedReply("INR", ["USD", "EUR", "XXX"], "2026-10-30")).toEqual({ base: "INR", date: "2026-10-30", rates: { USD: 0.011976, EUR: 0.011018 } });
    expect(providerCovers("INR")).toBe(true);
    expect(providerCovers("AED")).toBe(false);
  });
});
