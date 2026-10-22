import type { Types } from "mongoose";
import { Category } from "@/src/server/models";

/** What a budget on this category covers: the category and its live subcategories. */
export async function budgetCategoryIds(categoryId: Types.ObjectId): Promise<Types.ObjectId[]> {
  const children = await Category.find({ parentId: categoryId, deletedAt: null }).select("_id").lean();
  return [categoryId, ...children.map((child) => child._id)];
}
