import { describe, expect, it } from "vitest";
import { dueOccurrences, nextOccurrence } from "./next";

describe("nextOccurrence", () => {
  it("advances daily and weekly in UTC", () => {
    const start = new Date("2026-01-01T12:00:00.000Z");
    expect(nextOccurrence(start, { frequency: "daily", interval: 1 }).toISOString().slice(0, 10)).toBe(
      "2026-01-02",
    );
    expect(nextOccurrence(start, { frequency: "weekly", interval: 2 }).toISOString().slice(0, 10)).toBe(
      "2026-01-15",
    );
  });

  it("clamps monthly dates that do not exist", () => {
    const jan31 = new Date("2026-01-31T12:00:00.000Z");
    expect(nextOccurrence(jan31, { frequency: "monthly", interval: 1 }).toISOString().slice(0, 10)).toBe(
      "2026-02-28",
    );
  });
});

describe("dueOccurrences", () => {
  it("returns missed dates after last posted up to asOf", () => {
    const last = new Date("2026-01-01T12:00:00.000Z");
    const asOf = new Date("2026-01-20T12:00:00.000Z");
    const due = dueOccurrences(last, { frequency: "weekly", interval: 1 }, asOf);
    expect(due.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-01-08",
      "2026-01-15",
    ]);
  });

  it("keeps a month-end rule on its day after a short month", () => {
    // What the engine passes for a rule created on the 31st.
    const rule = { frequency: "monthly" as const, interval: 1, byMonthDay: 31 };
    const fromFeb = dueOccurrences(new Date("2026-02-28T12:00:00.000Z"), rule, new Date("2026-05-01T12:00:00.000Z"));
    expect(fromFeb.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-03-31", "2026-04-30"]);
  });

  it("stops at until", () => {
    const last = new Date("2026-01-01T12:00:00.000Z");
    const asOf = new Date("2026-02-01T12:00:00.000Z");
    const due = dueOccurrences(
      last,
      { frequency: "weekly", interval: 1, until: "2026-01-10" },
      asOf,
    );
    expect(due.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-01-08"]);
  });
});
