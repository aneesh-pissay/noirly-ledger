import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import { DashboardLayout } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { normalizeLayout, type Widget } from "@/src/core/dashboard-widgets";

/** The caller's dashboard in a workspace, or the default when they haven't set one. */
export function getDashboardLayout(userId: string, workspaceId: string): Promise<{ widgets: Widget[]; custom: boolean }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const doc = await DashboardLayout.findOne({ userId: new Types.ObjectId(userId), workspaceId: new Types.ObjectId(workspaceId) }).lean();
    return { widgets: normalizeLayout(doc?.widgets ?? null), custom: Boolean(doc) };
  });
}

/** Saves the caller's dashboard; null goes back to the default. Only theirs: nobody else's changes. */
export function saveDashboardLayout(userId: string, workspaceId: string, widgets: Widget[] | null) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const key = { userId: new Types.ObjectId(userId), workspaceId: new Types.ObjectId(workspaceId) };
    if (widgets === null) {
      await DashboardLayout.deleteOne(key);
      return { widgets: normalizeLayout(null), custom: false };
    }
    const clean = normalizeLayout(widgets);
    await DashboardLayout.updateOne(key, { $set: { widgets: clean } }, { upsert: true });
    return { widgets: clean, custom: true };
  });
}
