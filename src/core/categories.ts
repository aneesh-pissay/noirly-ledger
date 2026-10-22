/**
 * Categories go one level deep: a top-level category can have subcategories,
 * and a subcategory can't have its own. A budget on a top-level category
 * covers its subcategories too.
 */
export type CategoryNode = { id: string; name: string; parentId: string | null };

/** Whether `parentId` can be the category's parent. Pass `parentId` null to make it top-level. */
export function checkParent(input: {
  categoryId: string | null;
  hasChildren: boolean;
  parent: { id: string; parentId: string | null } | null;
  parentId: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (!input.parentId) return { ok: true };
  if (!input.parent) return { ok: false, error: "That parent category isn't in this workspace" };
  if (input.parent.id === input.categoryId) return { ok: false, error: "A category can't be inside itself" };
  if (input.parent.parentId) return { ok: false, error: "Subcategories go one level deep; pick a top-level category" };
  if (input.hasChildren) return { ok: false, error: "This category has subcategories, so it stays top-level" };
  return { ok: true };
}

export const PATH_SEPARATOR = " › ";

/**
 * Categories in picker order: each top-level one (by name) followed by its
 * subcategories (by name), with a "Parent › Child" label. A subcategory whose
 * parent is gone is listed as top-level.
 */
export function categoryTree<T extends CategoryNode>(categories: T[]): Array<T & { depth: 0 | 1; label: string }> {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const ids = new Set(categories.map((c) => c.id));
  const isTop = (c: T) => !c.parentId || !ids.has(c.parentId);
  const out: Array<T & { depth: 0 | 1; label: string }> = [];
  for (const top of categories.filter(isTop).sort(byName)) {
    out.push({ ...top, depth: 0, label: top.name });
    for (const child of categories.filter((c) => !isTop(c) && c.parentId === top.id).sort(byName)) {
      out.push({ ...child, depth: 1, label: `${top.name}${PATH_SEPARATOR}${child.name}` });
    }
  }
  return out;
}

/** The category and its subcategories: what a budget on it covers. */
export function withSubcategories(categoryId: string, categories: CategoryNode[]): string[] {
  return [categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)];
}

/** The top-level category a category rolls up into (itself if it's top-level or its parent is gone). */
export function topLevelOf(categoryId: string, categories: CategoryNode[]): string {
  const category = categories.find((c) => c.id === categoryId);
  if (!category?.parentId) return categoryId;
  return categories.some((c) => c.id === category.parentId) ? category.parentId : categoryId;
}
