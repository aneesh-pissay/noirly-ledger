import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Department, Project, Transaction, Workspace, WorkspaceMember, type DepartmentDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { memberGrants } from "@/src/server/approval-rules";
import { netSpentSum, projectSpent } from "@/src/server/projects";
import { notifyUsers } from "@/src/server/notifications/notify";
import { can } from "@/src/core/permissions/can";
import { defaultFiscalStart, formatMoney } from "@/src/core/locale-format";
import {
  budgetState,
  crossedLine,
  defaultDepartmentFor,
  groupPeriodWindow,
  parentProblem,
  withTeams,
  type DepartmentNode,
  type DepartmentView,
  type GroupPeriod,
} from "@/src/core/group-budgets";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

export type DepartmentInput = {
  name?: string;
  parentId?: string | null;
  budgetMinor?: number | null;
  period?: GroupPeriod;
  alertPct?: number;
  memberIds?: string[];
  archived?: boolean;
};

function nodeOf(d: DepartmentDocument): DepartmentNode {
  return { id: String(d._id), parentId: d.parentId ? String(d.parentId) : null, memberIds: d.memberIds.map(String), archived: Boolean(d.archivedAt) };
}

async function fiscalStartOf(workspaceId: Types.ObjectId) {
  const ws = await Workspace.findById(workspaceId).select("baseCurrency fiscalYearStartMonth kind").lean();
  if (!ws) throw new ApiError(404, "not_found", "Workspace not found");
  return { fiscalStart: ws.fiscalYearStartMonth ?? defaultFiscalStart(ws.baseCurrency), baseCurrency: ws.baseCurrency, personal: ws.kind === "personal" };
}

/** Posted spending (net of refunds) per department between two days. */
async function spendBetween(workspaceId: Types.ObjectId, window: { from: string; to: string }) {
  const rows = await Transaction.aggregate<{ _id: Types.ObjectId; spentMinor: number }>([
    {
      $match: {
        workspaceId,
        departmentId: { $ne: null },
        deletedAt: null,
        isPosted: true,
        date: { $gte: new Date(`${window.from}T00:00:00.000Z`), $lte: new Date(`${window.to}T23:59:59.999Z`) },
      },
    },
    { $group: { _id: "$departmentId", spentMinor: netSpentSum } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.spentMinor]));
}

/** Every department with its spending this period, teams rolled in. */
async function departmentViews(workspaceId: Types.ObjectId, at = new Date()): Promise<DepartmentView[]> {
  const [docs, { fiscalStart }] = await Promise.all([Department.find({ workspaceId }).sort({ name: 1 }), fiscalStartOf(workspaceId)]);
  const nodes = docs.map(nodeOf);
  const windows = new Map<GroupPeriod, { from: string; to: string }>();
  for (const d of docs) windows.set(d.period as GroupPeriod, groupPeriodWindow(d.period as GroupPeriod, at, fiscalStart));
  const spend = new Map<GroupPeriod, Map<string, number>>();
  for (const [period, window] of windows) spend.set(period, await spendBetween(workspaceId, window));
  return docs.map((d, i) => {
    const period = d.period as GroupPeriod;
    const own = spend.get(period)!;
    const spentMinor = withTeams(nodes, String(d._id)).reduce((sum, id) => sum + (own.get(id) ?? 0), 0);
    return {
      ...nodes[i]!,
      name: d.name,
      budgetMinor: d.budgetMinor ?? null,
      period,
      alertPct: d.alertPct,
      spentMinor,
      ...windows.get(period)!,
      ...budgetState(spentMinor, d.budgetMinor ?? null, d.alertPct),
    };
  });
}

/** The workspace's departments and teams, and where each budget stands. Anyone in it can see them. */
export function listDepartments(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const departments = await departmentViews(ws);
    return { departments, defaultDepartmentId: defaultDepartmentFor(departments, userId) };
  });
}

async function cleanMembers(workspaceId: Types.ObjectId, ids: string[]) {
  const members = await WorkspaceMember.find({ workspaceId, userId: { $in: [...new Set(ids)].map(oid) } }).select("userId").lean();
  return members.map((m) => m.userId);
}

/** Departments are set up like budgets, by approvers and owners. */
export function createDepartment(userId: string, workspaceId: string, input: Required<Omit<DepartmentInput, "archived">>) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const nodes = (await Department.find({ workspaceId: ws })).map(nodeOf);
    const problem = parentProblem(nodes, null, input.parentId);
    if (problem) throw new ApiError(400, "invalid_request", problem);
    const doc = await Department.create({
      workspaceId: ws,
      name: input.name.trim(),
      parentId: input.parentId ? oid(input.parentId) : null,
      budgetMinor: input.budgetMinor,
      period: input.period,
      alertPct: input.alertPct,
      memberIds: await cleanMembers(ws, input.memberIds),
      createdById: oid(userId),
    });
    return { id: String(doc._id) };
  });
}

export function updateDepartment(userId: string, workspaceId: string, departmentId: string, input: DepartmentInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    const doc = await Department.findOne({ _id: oid(departmentId), workspaceId: ws });
    if (!doc) throw new ApiError(404, "not_found", "Department not found");
    if (input.parentId !== undefined) {
      const nodes = (await Department.find({ workspaceId: ws })).map(nodeOf);
      const problem = parentProblem(nodes, String(doc._id), input.parentId);
      if (problem) throw new ApiError(400, "invalid_request", problem);
      doc.parentId = input.parentId ? oid(input.parentId) : null;
    }
    if (input.name !== undefined) doc.name = input.name.trim();
    if (input.budgetMinor !== undefined) doc.budgetMinor = input.budgetMinor;
    if (input.period !== undefined) doc.period = input.period;
    if (input.alertPct !== undefined) doc.alertPct = input.alertPct;
    if (input.memberIds !== undefined) doc.memberIds = await cleanMembers(ws, input.memberIds);
    if (input.archived !== undefined) doc.archivedAt = input.archived ? doc.archivedAt ?? new Date() : null;
    await doc.save();
    return { id: String(doc._id) };
  });
}

/** Only one nothing points at, and with no teams, can go; otherwise archive it. */
export function deleteDepartment(userId: string, workspaceId: string, departmentId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const doc = await Department.findOne({ _id: oid(departmentId), workspaceId: oid(workspaceId) });
    if (!doc) throw new ApiError(404, "not_found", "Department not found");
    if (await Department.exists({ parentId: doc._id })) throw new ApiError(409, "has_teams", "Move or delete its teams first");
    if (await Transaction.exists({ departmentId: doc._id, deletedAt: null })) {
      throw new ApiError(409, "department_in_use", "This department has spending. Archive it instead.");
    }
    await doc.deleteOne();
  });
}

/** For transactions: the department must be in the workspace and open, unless the transaction already had it. */
export async function assertTransactionDepartment(workspaceId: Types.ObjectId, departmentId: string | null | undefined, keepId?: string | null) {
  if (!departmentId) return;
  const doc = await Department.findOne({ _id: oid(departmentId), workspaceId }).select("archivedAt").lean();
  if (!doc) throw new ApiError(400, "invalid_request", "Department is not in this workspace");
  if (doc.archivedAt && String(keepId) !== departmentId) throw new ApiError(400, "invalid_request", "That department is archived");
}

/** Where someone's expenses go when they don't say: their one team, or their one department. */
export async function defaultDepartment(workspaceId: Types.ObjectId, userId: string) {
  const docs = await Department.find({ workspaceId, archivedAt: null, memberIds: oid(userId) });
  return defaultDepartmentFor(docs.map(nodeOf), userId);
}

/**
 * Tells those who manage budgets when new spending takes a department, its
 * parent, or a project past its alert line or its budget.
 */
export async function maybeNotifyGroupBudgets(input: { workspaceId: Types.ObjectId; departmentId: Types.ObjectId | null; projectId: Types.ObjectId | null; addedMinor: number }) {
  if (input.addedMinor <= 0 || (!input.departmentId && !input.projectId)) return;
  const alerts: Array<{ title: string; body: string }> = [];
  const { baseCurrency, personal } = await fiscalStartOf(input.workspaceId);
  const money = (minor: number) => formatMoney(minor, baseCurrency);

  if (input.departmentId) {
    const views = await departmentViews(input.workspaceId);
    const own = views.find((v) => v.id === String(input.departmentId));
    for (const v of [own, own?.parentId ? views.find((p) => p.id === own.parentId) : undefined]) {
      if (!v) continue;
      const crossed = crossedLine(v.spentMinor - input.addedMinor, v.spentMinor, v.budgetMinor, v.alertPct);
      if (crossed) {
        alerts.push({
          title: crossed === "over" ? `${v.name} is over budget` : `${v.name} reached ${v.alertPct}% of its budget`,
          body: `${money(v.spentMinor)} of ${money(v.budgetMinor!)} spent, ${v.from} to ${v.to}.`,
        });
      }
    }
  }
  if (input.projectId) {
    const project = await Project.findById(input.projectId).select("name budgetMinor alertPct").lean();
    if (project?.budgetMinor) {
      const spent = await projectSpent(input.projectId);
      const crossed = crossedLine(spent - input.addedMinor, spent, project.budgetMinor, project.alertPct ?? 80);
      if (crossed) {
        alerts.push({
          title: crossed === "over" ? `${project.name} is over budget` : `${project.name} reached ${project.alertPct ?? 80}% of its budget`,
          body: `${money(spent)} of ${money(project.budgetMinor)} spent so far.`,
        });
      }
    }
  }
  if (!alerts.length) return;
  const managers = (await memberGrants(input.workspaceId)).filter((m) => can(m.grant, "budget.manage")).map((m) => m.userId);
  for (const alert of alerts) {
    // A personal workspace has projects but no departments page.
    const href = personal ? "/projects" : `/w/${String(input.workspaceId)}/departments`;
    await notifyUsers({ userIds: managers, workspaceId: String(input.workspaceId), kind: "budget.threshold", ...alert, href });
  }
}
