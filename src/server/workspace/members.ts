import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { withDb } from "@/src/server/db/mongodb";
import {
  LedgerUser,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from "@/src/server/models";
import { ApiError } from "@/src/server/api/http";
import { can, customRolePermissions, roleOf, type Grant, type PermissionAction } from "@/src/core/permissions/can";
import type { MemberRole } from "@/src/core/models/enums";

function oid(id: string) {
  return new Types.ObjectId(id);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type MemberView = {
  userId: string;
  email: string;
  displayName: string;
  role: MemberRole;
  customRoleId: string | null;
  customRoleName: string | null;
};

/**
 * What a membership may do: its custom role's permissions when it has one
 * (an owner keeps everything), else its built-in role.
 */
export async function grantFor(membership: { role: string; customRoleId?: Types.ObjectId | null }): Promise<Grant> {
  const role = membership.role as MemberRole;
  if (!membership.customRoleId || role === "owner") return role;
  const custom = await WorkspaceRole.findById(membership.customRoleId).select("permissions").lean();
  // A role since deleted leaves the member on their built-in role.
  return custom ? { role, permissions: customRolePermissions(custom.permissions) } : role;
}

export async function requireMembershipRole(userId: string, workspaceId: string): Promise<Grant> {
  const membership = await WorkspaceMember.findOne({
    workspaceId: oid(workspaceId),
    userId: oid(userId),
  }).lean();
  if (!membership) {
    throw new ApiError(403, "forbidden", "Not a member of this workspace");
  }
  return grantFor(membership);
}

export async function requireAction(
  userId: string,
  workspaceId: string,
  action: PermissionAction,
): Promise<Grant> {
  const role = await requireMembershipRole(userId, workspaceId);
  if (!can(role, action)) {
    throw new ApiError(403, "forbidden", "Insufficient permissions");
  }
  return role;
}

export async function listMembers(workspaceId: string): Promise<MemberView[]> {
  const memberships = await WorkspaceMember.find({
    workspaceId: oid(workspaceId),
  }).lean();
  const users = await LedgerUser.find({
    _id: { $in: memberships.map((m) => m.userId) },
  }).lean();
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  const roles = new Map((await WorkspaceRole.find({ workspaceId: oid(workspaceId) }).select("name").lean()).map((r) => [String(r._id), r.name]));
  return memberships.map((membership) => {
    const user = byId.get(membership.userId.toString());
    const customRoleId = membership.customRoleId && roles.has(String(membership.customRoleId)) ? String(membership.customRoleId) : null;
    return {
      userId: membership.userId.toString(),
      email: user?.email ?? "",
      displayName: user?.displayName ?? "Unknown",
      role: membership.role as MemberRole,
      customRoleId,
      customRoleName: customRoleId ? roles.get(customRoleId)! : null,
    };
  });
}

export async function createInvite(input: {
  workspaceId: string;
  userId: string;
  role: Exclude<MemberRole, "owner">;
}) {
  return withDb(async () => {
    await requireAction(input.userId, input.workspaceId, "members.manage");
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await WorkspaceInvite.create({
      workspaceId: oid(input.workspaceId),
      role: input.role,
      tokenHash: hashToken(token),
      createdById: oid(input.userId),
      expiresAt,
    });
    return { token, expiresAt: expiresAt.toISOString(), role: input.role };
  });
}

export async function acceptInvite(userId: string, token: string) {
  return withDb(async () => {
    const invite = await WorkspaceInvite.findOne({ tokenHash: hashToken(token) });
    if (!invite || invite.revokedAt) {
      throw new ApiError(404, "not_found", "Invite is invalid");
    }
    if (invite.usedAt) {
      throw new ApiError(400, "invalid_request", "Invite already used");
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new ApiError(400, "invalid_request", "Invite expired");
    }
    const existing = await WorkspaceMember.findOne({
      workspaceId: invite.workspaceId,
      userId: oid(userId),
    });
    if (!existing) {
      await WorkspaceMember.create({
        workspaceId: invite.workspaceId,
        userId: oid(userId),
        role: invite.role,
      });
    }
    invite.usedAt = new Date();
    await invite.save();
    const workspace = await Workspace.findById(invite.workspaceId).lean();
    if (!workspace) {
      throw new ApiError(404, "not_found", "Workspace not found");
    }
    return { workspaceId: workspace._id.toString(), name: workspace.name };
  });
}

export async function updateMemberRole(input: {
  actorId: string;
  workspaceId: string;
  targetUserId: string;
  role: MemberRole;
  /** A custom role to give them, null to take it away; left out, it stays as it is. */
  customRoleId?: string | null;
}) {
  return withDb(async () => {
    const actorRole = roleOf(await requireAction(
      input.actorId,
      input.workspaceId,
      "members.manage",
    ));
    if (input.role === "owner" && actorRole !== "owner") {
      throw new ApiError(403, "forbidden", "Only the owner can assign owner");
    }
    if (input.targetUserId === input.actorId && input.role !== actorRole) {
      throw new ApiError(400, "invalid_request", "You cannot change your own role");
    }
    const membership = await WorkspaceMember.findOne({
      workspaceId: oid(input.workspaceId),
      userId: oid(input.targetUserId),
    });
    if (!membership) {
      throw new ApiError(404, "not_found", "Member not found");
    }
    if (membership.role === "owner" && input.role !== "owner") {
      const owners = await WorkspaceMember.countDocuments({
        workspaceId: oid(input.workspaceId),
        role: "owner",
      });
      if (owners <= 1) {
        throw new ApiError(400, "invalid_request", "Keep at least one owner");
      }
    }
    membership.role = input.role;
    if (input.role === "owner") {
      // An owner can do everything; a custom role would only narrow that.
      membership.customRoleId = null;
    } else if (input.customRoleId !== undefined) {
      if (input.customRoleId && !(await WorkspaceRole.exists({ _id: oid(input.customRoleId), workspaceId: oid(input.workspaceId) }))) {
        throw new ApiError(400, "invalid_request", "That role isn't in this workspace");
      }
      membership.customRoleId = input.customRoleId ? oid(input.customRoleId) : null;
    }
    await membership.save();
    return { userId: input.targetUserId, role: input.role, customRoleId: membership.customRoleId ? String(membership.customRoleId) : null };
  });
}

export async function removeMember(input: {
  actorId: string;
  workspaceId: string;
  targetUserId: string;
}) {
  return withDb(async () => {
    await requireAction(input.actorId, input.workspaceId, "members.manage");
    const membership = await WorkspaceMember.findOne({
      workspaceId: oid(input.workspaceId),
      userId: oid(input.targetUserId),
    });
    if (!membership) {
      throw new ApiError(404, "not_found", "Member not found");
    }
    if (membership.role === "owner") {
      const owners = await WorkspaceMember.countDocuments({
        workspaceId: oid(input.workspaceId),
        role: "owner",
      });
      if (owners <= 1) {
        throw new ApiError(400, "invalid_request", "Keep at least one owner");
      }
    }
    await membership.deleteOne();
  });
}
