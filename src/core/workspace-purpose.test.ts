import { describe, expect, it } from "vitest";
import { hasSection, poolsLabel, startingCategories, WORKSPACE_PURPOSES } from "@/src/core/workspace-purpose";
import { DEFAULT_CATEGORIES } from "@/src/core/categories/defaults";

describe("workspace purposes", () => {
  it("show the pages each kind of workspace needs", () => {
    expect(hasSection("team", "transactions")).toBe(false);
    expect(hasSection("household", "budgets")).toBe(true);
    expect(hasSection("household", "approvals")).toBe(false);
    expect(hasSection("business", "approvals")).toBe(true);
    expect(poolsLabel("household")).toBe("Shared pots");
    expect(poolsLabel("business")).toBe("Budget pools");
  });

  it("start with their own categories, always with Income and Transfer, each name once", () => {
    for (const purpose of WORKSPACE_PURPOSES) {
      const names = startingCategories(purpose).map((c) => c.name);
      expect(names).toContain("Income");
      expect(names).toContain("Transfer");
      expect(new Set(names).size).toBe(names.length);
    }
    expect(startingCategories("household").map((c) => c.name)).toContain("Kids");
    expect(startingCategories("business").map((c) => c.name)).toContain("Software and subscriptions");
    expect(startingCategories("personal")).toEqual(DEFAULT_CATEGORIES);
    expect(startingCategories("team")).toEqual(DEFAULT_CATEGORIES);
  });
});
