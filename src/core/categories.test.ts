import { describe, expect, it } from "vitest";
import { categoryTree, checkParent, topLevelOf, withSubcategories } from "@/src/core/categories";

const categories = [
  { id: "f", name: "Food", parentId: null },
  { id: "g", name: "Groceries", parentId: "f" },
  { id: "d", name: "Dining out", parentId: "f" },
  { id: "t", name: "Travel", parentId: null },
  { id: "o", name: "Orphan", parentId: "gone" },
];

describe("checkParent", () => {
  const top = { id: "f", parentId: null };

  it("allows one level under a top-level category", () => {
    expect(checkParent({ categoryId: "x", hasChildren: false, parent: top, parentId: "f" })).toEqual({ ok: true });
    expect(checkParent({ categoryId: "x", hasChildren: true, parent: null, parentId: null })).toEqual({ ok: true });
  });

  it("refuses deeper trees, loops and missing parents", () => {
    expect(checkParent({ categoryId: "x", hasChildren: false, parent: { id: "g", parentId: "f" }, parentId: "g" }).ok).toBe(false);
    expect(checkParent({ categoryId: "f", hasChildren: false, parent: top, parentId: "f" }).ok).toBe(false);
    expect(checkParent({ categoryId: "t", hasChildren: true, parent: top, parentId: "f" })).toEqual({ ok: false, error: "This category has subcategories, so it stays top-level" });
    expect(checkParent({ categoryId: "x", hasChildren: false, parent: null, parentId: "nope" }).ok).toBe(false);
  });
});

describe("categoryTree", () => {
  it("lists each parent then its children, labelled with the path", () => {
    expect(categoryTree(categories).map((c) => [c.label, c.depth])).toEqual([
      ["Food", 0],
      ["Food › Dining out", 1],
      ["Food › Groceries", 1],
      ["Orphan", 0],
      ["Travel", 0],
    ]);
  });
});

describe("roll-ups", () => {
  it("covers a parent's subcategories and finds a child's parent", () => {
    expect(withSubcategories("f", categories)).toEqual(["f", "g", "d"]);
    expect(withSubcategories("g", categories)).toEqual(["g"]);
    expect(topLevelOf("g", categories)).toBe("f");
    expect(topLevelOf("f", categories)).toBe("f");
    expect(topLevelOf("o", categories)).toBe("o");
  });
});

describe("category patches", () => {
  it("change only what they name", async () => {
    const { updateCategoryBodySchema } = await import("@/src/core/schemas/ledger");
    expect(updateCategoryBodySchema.parse({ parentId: null })).toEqual({ parentId: null });
    expect(updateCategoryBodySchema.parse({ name: "Food" })).toEqual({ name: "Food" });
  });
});
