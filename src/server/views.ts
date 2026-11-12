import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { TransactionView } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { VIEW_FILTER_KEYS, type ViewFilters } from "@/src/core/search";
import type { SavedView } from "@/src/core/sync/types";

const MAX_VIEWS = 30;

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** Only known filters, as strings, are kept. */
function cleanFilters(filters: Record<string, unknown>): ViewFilters {
  const clean: ViewFilters = {};
  for (const key of VIEW_FILTER_KEYS) {
    const value = filters[key];
    if (typeof value === "string" && value.trim()) clean[key] = value.trim().slice(0, 120);
  }
  return clean;
}

function map(doc: { _id: Types.ObjectId; name: string; filters: unknown }): SavedView {
  return { id: String(doc._id), name: doc.name, filters: cleanFilters((doc.filters ?? {}) as Record<string, unknown>) };
}

/** The workspace's saved views, by name. A view only reads, so anyone in the workspace can keep one. */
export function listViews(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await TransactionView.find({ workspaceId: oid(workspaceId) }).sort({ name: 1 }).lean();
    return docs.map(map);
  });
}

export function createView(userId: string, workspaceId: string, input: { name: string; filters: Record<string, unknown> }) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const filters = cleanFilters(input.filters);
    if (!Object.keys(filters).length) throw new ApiError(400, "invalid_request", "Search or filter first, then save it as a view");
    if ((await TransactionView.countDocuments({ workspaceId: oid(workspaceId) })) >= MAX_VIEWS) {
      throw new ApiError(400, "limit_reached", `A workspace can keep up to ${MAX_VIEWS} views.`);
    }
    const doc = await TransactionView.create({ workspaceId: oid(workspaceId), name: input.name.trim(), filters, createdById: oid(userId) });
    return map(doc.toObject());
  });
}

export function deleteView(userId: string, viewId: string) {
  return withDb(async () => {
    const doc = await TransactionView.findById(oid(viewId));
    if (!doc) throw new ApiError(404, "not_found", "View not found");
    await requireMembershipRole(userId, String(doc.workspaceId));
    await doc.deleteOne();
  });
}
