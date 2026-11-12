import { startingCategories, type WorkspacePurpose } from "@/src/core/workspace-purpose";
import { Category } from "@/src/server/models";
import type { Types } from "mongoose";

/** A new workspace's starting categories, which depend on what it's for. */
export async function seedSystemCategories(workspaceId: Types.ObjectId, purpose: WorkspacePurpose | "personal" = "personal") {
  const existing = await Category.countDocuments({
    workspaceId,
    isSystem: true,
    deletedAt: null,
  });
  if (existing > 0) return;

  await Category.insertMany(
    startingCategories(purpose).map((category) => ({
      workspaceId,
      name: category.name,
      icon: category.icon,
      color: category.color,
      isSystem: true,
    })),
  );
}
