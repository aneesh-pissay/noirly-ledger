import { normalizeTags } from "@/src/core/labels";

/**
 * Changing or deleting many transactions at once, and adding several in one
 * go. Each selected transaction is changed as if one at a time, so its usual
 * rules still apply (a reconciled one stays fixed, a split one keeps its
 * lines); the ones that can't change are reported, the rest go through.
 * Adding several is all or nothing.
 */
export const MAX_BULK = 200;
export const MAX_BULK_CREATE = 100;

export type BulkChange = {
  categoryId?: string | null;
  projectId?: string | null;
  clearing?: "pending" | "cleared";
  merchant?: string | null;
  addTags?: string[];
  removeTags?: string[];
};

/** A transaction's tags after adding and removing some, in the same normal form tags are stored in. */
export function changedTags(current: string[], add: string[] = [], remove: string[] = []) {
  const removing = new Set(normalizeTags(remove));
  return normalizeTags([...current, ...add]).filter((tag) => !removing.has(tag));
}

/** The one-transaction patch a bulk change makes, given the transaction's tags now. */
export function patchFor(change: BulkChange, currentTags: string[]) {
  const patch: { categoryId?: string | null; projectId?: string | null; clearing?: "pending" | "cleared"; merchant?: string | null; tags?: string[] } = {};
  if (change.categoryId !== undefined) patch.categoryId = change.categoryId;
  if (change.projectId !== undefined) patch.projectId = change.projectId;
  if (change.clearing !== undefined) patch.clearing = change.clearing;
  if (change.merchant !== undefined) patch.merchant = change.merchant;
  if (change.addTags?.length || change.removeTags?.length) patch.tags = changedTags(currentTags, change.addTags, change.removeTags);
  return patch;
}

/** What a bulk run did: how many went through, and why the others didn't. */
export function bulkSummary(results: Array<{ id: string; error: string | null }>) {
  const failed = results.filter((r) => r.error).map((r) => ({ id: r.id, error: r.error! }));
  return { done: results.length - failed.length, failed };
}
