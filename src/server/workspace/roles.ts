import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { WorkspaceMember, WorkspaceRole } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { customRolePermissions } from "@/src/core/permissions/can";
import type { CustomRoleView } from "@/src/core/sync/types";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/** A workspace's own roles, with how many members have each. */
export function listRoles(userId: string, workspaceId: string): Promise<{ roles: CustomRoleView[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const [roles, counts] = await Promise.all([
      WorkspaceRole.find({ workspaceId: ws }).sort({ name: 1 }).lean(),
      WorkspaceMember.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { workspaceId: ws, customRoleId: { $ne: null } } }, { $group: { _id: "$customRoleId", n: { $sum: 1 } } }]),
    ]);
    const memberCount = new Map(counts.map((c) => [String(c._id), c.n]));
    return {
      roles: roles.map((r) => ({ id: String(r._id), name: r.name, permissions: customRolePermissions(r.permissions), memberCount: memberCount.get(String(r._id)) ?? 0 })),
    };
  });
}

/** A unique name in the workspace, or a 409 saying it's taken. */
async function nameFree(workspaceId: Types.ObjectId, name: string, exceptId?: Types.ObjectId) {
  const taken = await WorkspaceRole.exists({ workspaceId, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (taken) throw new ApiError(409, "already_exists", "There's already a role with that name");
}

export function createRole(userId: string, workspaceId: string, input: { name: string; permissions: string[] }) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const ws = oid(workspaceId);
    const name = input.name.trim();
    await nameFree(ws, name);
    const doc = await WorkspaceRole.create({ workspaceId: ws, name, permissions: customRolePermissions(input.permissions), createdById: oid(userId) });
    return { id: String(doc._id), name: doc.name, permissions: customRolePermissions(doc.permissions), memberCount: 0 } satisfies CustomRoleView;
  });
}

/** Renames a role or changes what it may do; members with it get the change at once. */
export function updateRole(userId: string, workspaceId: string, roleId: string, input: { name?: string; permissions?: string[] }) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const doc = await WorkspaceRole.findOne({ _id: oid(roleId), workspaceId: oid(workspaceId) });
    if (!doc) throw new ApiError(404, "not_found", "Role not found");
    if (input.name !== undefined) {
      await nameFree(doc.workspaceId, input.name.trim(), doc._id);
      doc.name = input.name.trim();
    }
    if (input.permissions !== undefined) doc.permissions = customRolePermissions(input.permissions);
    await doc.save();
    return { id: String(doc._id), name: doc.name, permissions: customRolePermissions(doc.permissions) };
  });
}

/** Deletes a role; its members go back to their built-in role. */
export function deleteRole(userId: string, workspaceId: string, roleId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "members.manage");
    const doc = await WorkspaceRole.findOne({ _id: oid(roleId), workspaceId: oid(workspaceId) });
    if (!doc) throw new ApiError(404, "not_found", "Role not found");
    await WorkspaceMember.updateMany({ workspaceId: doc.workspaceId, customRoleId: doc._id }, { $set: { customRoleId: null } });
    await doc.deleteOne();
  });
}
