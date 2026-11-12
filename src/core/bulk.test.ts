import { describe, expect, it } from "vitest";
import { bulkSummary, changedTags, patchFor } from "@/src/core/bulk";

describe("changedTags", () => {
  it("adds and removes tags in their stored form, each once", () => {
    expect(changedTags(["trip"], ["#Work", "trip"], [])).toEqual(["trip", "work"]);
    expect(changedTags(["trip", "work"], [], ["TRIP"])).toEqual(["work"]);
    expect(changedTags([], ["a"], ["a"])).toEqual([]);
  });
});

describe("patchFor", () => {
  it("only changes what the bulk change names", () => {
    expect(patchFor({ categoryId: "c" }, ["x"])).toEqual({ categoryId: "c" });
    expect(patchFor({ clearing: "cleared", addTags: ["y"] }, ["x"])).toEqual({ clearing: "cleared", tags: ["x", "y"] });
    expect(patchFor({ projectId: null, merchant: null }, [])).toEqual({ projectId: null, merchant: null });
    expect(patchFor({}, ["x"])).toEqual({});
  });
});

describe("bulkSummary", () => {
  it("counts what went through and lists the rest", () => {
    expect(bulkSummary([{ id: "a", error: null }, { id: "b", error: "Reconciled" }])).toEqual({ done: 1, failed: [{ id: "b", error: "Reconciled" }] });
  });
});
