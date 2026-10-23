import { describe, expect, it } from "vitest";
import { diffSnapshots, snapshotOf } from "@/src/core/history";

const base = {
  type: "expense",
  amountMinor: 4_500,
  currency: "USD",
  date: "2026-10-23",
  categoryId: "food",
  accountId: null,
  note: "Lunch",
  tags: ["work"],
  clearing: "cleared",
};

describe("change history", () => {
  it("lists only what changed, from what to what", () => {
    const before = snapshotOf(base);
    const after = snapshotOf({ ...base, amountMinor: 5_000, note: "Team lunch", tags: ["work", "team"] });
    expect(diffSnapshots(before, after)).toEqual([
      { field: "amountMinor", from: 4_500, to: 5_000 },
      { field: "note", from: "Lunch", to: "Team lunch" },
      { field: "tags", from: "work", to: "work, team" },
    ]);
    expect(diffSnapshots(before, snapshotOf({ ...base }))).toEqual([]);
  });

  it("treats empty and missing the same, and older rows as cleared", () => {
    expect(diffSnapshots(snapshotOf({ ...base, note: "", tags: [] }), snapshotOf({ ...base, note: null, tags: undefined }))).toEqual([]);
    expect(snapshotOf({ ...base, clearing: null }).clearing).toBe("cleared");
  });

  it("compares split lines as a whole", () => {
    const split = snapshotOf({ ...base, categoryId: null, splits: [{ categoryId: "a", amountMinor: 1_000 }, { categoryId: "b", amountMinor: 3_500 }] });
    expect(split.splits).toBe("a:1000, b:3500");
    expect(diffSnapshots(snapshotOf(base), split).map((c) => c.field)).toEqual(["categoryId", "splits"]);
  });
});
