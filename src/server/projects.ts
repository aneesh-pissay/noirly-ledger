import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Project as ProjectModel, Transaction as TransactionModel, type ProjectDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import type { Project } from "@/src/core/sync/types";

const MAX_PROJECTS = 100;

/** A malformed id is the caller's mistake (400), not a server error. */
function oid(id: string | Types.ObjectId) {
  if (!Types.ObjectId.isValid(String(id))) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(String(id));
}

type Totals = { spentMinor: number; incomeMinor: number; count: number };

/** Base-currency spending net of refunds, as a $group sum. */
export const netSpentSum = {
  $sum: {
    $switch: {
      branches: [
        { case: { $eq: ["$type", "expense"] }, then: "$baseAmountMinor" },
        { case: { $eq: ["$type", "refund"] }, then: { $multiply: ["$baseAmountMinor", -1] } },
      ],
      default: 0,
    },
  },
};

/** Posted, live transactions per project in base currency: spending net of refunds, and income. */
async function totals(projectIds: Types.ObjectId[]) {
  const byProject = new Map<string, Totals>();
  if (!projectIds.length) return byProject;
  const rows = await TransactionModel.aggregate<{ _id: Types.ObjectId; spentMinor: number; incomeMinor: number; count: number }>([
    { $match: { projectId: { $in: projectIds }, deletedAt: null, isPosted: true } },
    {
      $group: {
        _id: "$projectId",
        spentMinor: netSpentSum,
        incomeMinor: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$baseAmountMinor", 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  for (const row of rows) byProject.set(String(row._id), { spentMinor: row.spentMinor, incomeMinor: row.incomeMinor, count: row.count });
  return byProject;
}

function map(doc: ProjectDocument, total?: Totals): Project {
  return {
    id: String(doc._id),
    workspaceId: String(doc.workspaceId),
    name: doc.name,
    color: doc.color,
    archived: Boolean(doc.archivedAt),
    spentMinor: total?.spentMinor ?? 0,
    incomeMinor: total?.incomeMinor ?? 0,
    transactionCount: total?.count ?? 0,
  };
}

/** The workspace's projects with their totals, open ones first. Anyone in it can see them. */
export function listProjects(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await ProjectModel.find({ workspaceId: oid(workspaceId) }).sort({ archivedAt: 1, name: 1 }).lean();
    const sums = await totals(docs.map((d) => d._id));
    return docs.map((doc) => map(doc as ProjectDocument, sums.get(String(doc._id))));
  });
}

/** Projects are set up like categories, by approvers and owners. */
export function createProject(userId: string, workspaceId: string, input: { name: string; color?: string }) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    if ((await ProjectModel.countDocuments({ workspaceId: oid(workspaceId), archivedAt: null })) >= MAX_PROJECTS) {
      throw new ApiError(400, "limit_reached", `A workspace can have up to ${MAX_PROJECTS} open projects.`);
    }
    const doc = await ProjectModel.create({
      workspaceId: oid(workspaceId),
      name: input.name.trim(),
      ...(input.color ? { color: input.color } : {}),
      createdById: oid(userId),
    });
    return map(doc.toObject());
  });
}

async function requireProject(userId: string, projectId: string) {
  const doc = await ProjectModel.findById(oid(projectId));
  if (!doc) throw new ApiError(404, "not_found", "Project not found");
  await requireAction(userId, String(doc.workspaceId), "budget.manage");
  return doc;
}

export function updateProject(userId: string, projectId: string, patch: { name?: string; color?: string; archived?: boolean }) {
  return withDb(async () => {
    const doc = await requireProject(userId, projectId);
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.color !== undefined) doc.color = patch.color;
    if (patch.archived !== undefined) doc.archivedAt = patch.archived ? doc.archivedAt ?? new Date() : null;
    await doc.save();
    return map(doc.toObject(), (await totals([doc._id])).get(String(doc._id)));
  });
}

/** Only a project nothing points at can go; otherwise archive it. */
export function deleteProject(userId: string, projectId: string) {
  return withDb(async () => {
    const doc = await requireProject(userId, projectId);
    if (await TransactionModel.exists({ projectId: doc._id, deletedAt: null })) {
      throw new ApiError(409, "project_in_use", "This project has transactions. Archive it instead.");
    }
    await doc.deleteOne();
  });
}

/** For transactions: the project must be in the workspace and open, unless the transaction already had it. */
export async function assertTransactionProject(workspaceId: Types.ObjectId, projectId: string | null | undefined, keepProjectId?: string | null) {
  if (!projectId) return;
  const project = await ProjectModel.findOne({ _id: oid(projectId), workspaceId }).select("archivedAt").lean();
  if (!project) throw new ApiError(400, "invalid_request", "Project is not in this workspace");
  if (project.archivedAt && String(keepProjectId) !== projectId) throw new ApiError(400, "invalid_request", "That project is archived");
}
