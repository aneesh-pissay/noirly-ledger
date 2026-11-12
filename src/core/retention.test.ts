import { describe, expect, it } from "vitest";
import { anyRule, confirmsName, cutoff, DEFAULT_RETENTION, retentionProblem } from "./retention";

describe("retention", () => {
  it("only allows the offered periods", () => {
    expect(retentionProblem(DEFAULT_RETENTION)).toBeNull();
    expect(retentionProblem({ ...DEFAULT_RETENTION, notificationsDays: 90 })).toBeNull();
    expect(retentionProblem({ ...DEFAULT_RETENTION, notificationsDays: 7 as never })).toMatch(/30, 90 or 365/);
  });

  it("works out the cutoff, and none when the rule is off", () => {
    const now = new Date("2026-10-31T00:00:00Z");
    expect(cutoff(30, now)?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(cutoff(null, now)).toBeNull();
    expect(anyRule(DEFAULT_RETENTION)).toBe(false);
    expect(anyRule({ ...DEFAULT_RETENTION, unmatchedReceiptsDays: 365 })).toBe(true);
    expect(anyRule(null)).toBe(false);
  });

  it("needs the workspace's name typed to delete it", () => {
    expect(confirmsName("  Ops Team ", "Ops Team")).toBe(true);
    expect(confirmsName("ops team", "Ops Team")).toBe(false);
    expect(confirmsName("", "")).toBe(false);
  });
});
