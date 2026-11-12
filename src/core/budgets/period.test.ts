import { describe, expect, it } from "vitest";
import { isoDate, periodWindow } from "./period";

describe("periodWindow", () => {
  it("runs a yearly budget over the financial year", () => {
    const at = new Date("2027-02-10T12:00:00.000Z");
    expect(periodWindow("yearly", at, undefined, 4)).toEqual({
      from: new Date("2026-04-01T00:00:00.000Z"),
      to: new Date("2027-03-31T23:59:59.999Z"),
    });
    const calendar = periodWindow("yearly", at);
    expect(isoDate(calendar.from)).toBe("2027-01-01");
    expect(isoDate(calendar.to)).toBe("2027-12-31");
    expect(isoDate(periodWindow("yearly", new Date("2026-04-01T00:00:00.000Z"), undefined, 4).from)).toBe("2026-04-01");
  });

  it("returns the UTC month for monthly", () => {
    const at = new Date("2026-08-14T12:00:00.000Z");
    const { from, to } = periodWindow("monthly", at);
    expect(isoDate(from)).toBe("2026-08-01");
    expect(isoDate(to)).toBe("2026-08-31");
  });

  it("returns Monday–Sunday for weekly", () => {
    const at = new Date("2026-08-14T12:00:00.000Z"); // Friday
    const { from, to } = periodWindow("weekly", at);
    expect(isoDate(from)).toBe("2026-08-10");
    expect(isoDate(to)).toBe("2026-08-16");
  });
});
