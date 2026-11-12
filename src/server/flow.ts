import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { FlowLink, FlowTask, Workspace, type FlowLinkDocument } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { getBillCalendar } from "@/src/server/bills";
import { notifyUsers } from "@/src/server/notifications/notify";
import { FlowError, flowClient, flowUrl, type FlowProject, type FlowWorkspace } from "@/src/server/flow-client";
import { open, seal } from "@/src/server/security/secret-box";
import { formatMoney } from "@/src/core/locale-format";
import { addDays } from "@/src/core/projection";
import { shiftMonth } from "@/src/core/bills";
import { billTask, flowDueAt, flowSettingsProblem, markerTask, planSync, type DesiredTask, type FlowLinkSettings, type FlowLinkView, type FlowPriority, type TrackedTask } from "@/src/core/flow-sync";

/** A run makes at most this many tasks; the rest come the next day. */
const MAX_CREATES = 50;
/** How long a run holds a link, so two runs at once don't both make its tasks. */
const LOCK_MS = 5 * 60_000;



async function view(doc: FlowLinkDocument): Promise<FlowLinkView> {
  return {
    bills: doc.bills,
    reminders: doc.reminders,
    daysAhead: doc.daysAhead,
    priority: doc.priority as FlowPriority,
    tokenHint: doc.tokenHint,
    flowWorkspaceId: doc.flowWorkspaceId,
    flowWorkspaceName: doc.flowWorkspaceName,
    flowProjectId: doc.flowProjectId ?? null,
    flowProjectName: doc.flowProjectName ?? null,
    paused: doc.paused,
    lastSyncAt: doc.lastSyncAt ? doc.lastSyncAt.toISOString() : null,
    lastResult: doc.lastResult ?? null,
    lastOk: doc.lastOk ?? null,
    openTasks: await FlowTask.countDocuments({ linkId: doc._id, state: "open" }),
  };
}

function own(userId: string, workspaceId: string) {
  return { userId: new Types.ObjectId(userId), workspaceId: new Types.ObjectId(workspaceId) };
}

function asApiError(error: unknown): never {
  if (error instanceof FlowError) throw new ApiError(error.status === 401 || error.status === 403 ? 400 : 502, "flow_error", error.message);
  throw error;
}

export function getFlowLink(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const doc = await FlowLink.findOne(own(userId, workspaceId));
    return { configured: Boolean(flowUrl()), flowUrl: flowUrl(), link: doc ? await view(doc) : null };
  });
}

/**
 * What a token can reach in Flow: its workspaces, and a workspace's
 * projects. Without a token, the one already linked is used.
 */
export function lookUpFlow(userId: string, workspaceId: string, input: { token?: string | null; flowWorkspaceId?: string | null }) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    let token = input.token?.trim();
    if (!token) {
      const doc = await FlowLink.findOne(own(userId, workspaceId)).select("tokenSealed").lean();
      if (!doc) throw new ApiError(400, "invalid_request", "Paste a Flow access token");
      token = open(doc.tokenSealed);
    }
    const flow = flowClient(token);
    try {
      const workspaces: FlowWorkspace[] = await flow.workspaces();
      const projects: FlowProject[] = input.flowWorkspaceId ? (await flow.projects(input.flowWorkspaceId)).filter((p) => !p.archivedAt) : [];
      return { workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })), projects: projects.map((p) => ({ id: p.id, name: p.name })) };
    } catch (error) {
      asApiError(error);
    }
  });
}

/** Links (or relinks) a workspace to Flow; a new token is checked by using it, and only a read and write one will do. */
export function saveFlowLink(
  userId: string,
  workspaceId: string,
  input: FlowLinkSettings & { token?: string | null; flowWorkspaceId: string; flowProjectId: string | null; paused?: boolean },
) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    if (!flowUrl()) throw new ApiError(400, "invalid_request", "Noirly Flow isn't set up on this server");
    const problem = flowSettingsProblem(input);
    if (problem) throw new ApiError(400, "invalid_request", problem);
    const existing = await FlowLink.findOne(own(userId, workspaceId));
    const token = input.token?.trim() || (existing ? open(existing.tokenSealed) : null);
    if (!token) throw new ApiError(400, "invalid_request", "Paste a Flow access token");
    if (!token.startsWith("nfp_w_")) throw new ApiError(400, "invalid_request", "Use a read and write token (it starts nfp_w_)");

    const flow = flowClient(token);
    let workspace: FlowWorkspace | undefined;
    let project: FlowProject | undefined;
    try {
      workspace = (await flow.workspaces()).find((w) => w.id === input.flowWorkspaceId);
      if (!workspace) throw new ApiError(400, "invalid_request", "That token can't reach that Flow workspace");
      if (input.flowProjectId) {
        project = (await flow.projects(workspace.id)).find((p) => p.id === input.flowProjectId);
        if (!project) throw new ApiError(400, "invalid_request", "That project isn't in that Flow workspace");
      }
    } catch (error) {
      asApiError(error);
    }

    // Tasks already made stay where they are; a new Flow workspace starts afresh.
    if (existing && existing.flowWorkspaceId !== workspace.id) await FlowTask.deleteMany({ linkId: existing._id });
    const doc = await FlowLink.findOneAndUpdate(
      own(userId, workspaceId),
      {
        $set: {
          ...(input.token?.trim() ? { tokenSealed: seal(token), tokenHint: token.slice(-4) } : {}),
          flowWorkspaceId: workspace.id,
          flowWorkspaceName: workspace.name,
          flowProjectId: project?.id ?? null,
          flowProjectName: project?.name ?? null,
          bills: input.bills,
          reminders: input.reminders,
          daysAhead: input.daysAhead,
          priority: input.priority,
          paused: input.paused ?? false,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    return view(doc!);
  });
}

/** Unlinks; the tasks already in Flow stay there. */
export function deleteFlowLink(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const doc = await FlowLink.findOneAndDelete(own(userId, workspaceId));
    if (!doc) throw new ApiError(404, "not_found", "Not linked to Flow");
    await FlowTask.deleteMany({ linkId: doc._id });
  });
}

/** The months to look through: last month (for bills gone overdue) up to the one `through` is in. */
function monthsToScan(today: string, through: string) {
  const months = [shiftMonth(today.slice(0, 7), -1)];
  while (months.at(-1)! < through.slice(0, 7)) months.push(shiftMonth(months.at(-1)!, 1));
  return months;
}

/** Brings one link's Flow tasks up to date; says what it did. */
async function syncLink(link: FlowLinkDocument, now: Date): Promise<string> {
  const userId = String(link.userId);
  const workspaceId = String(link.workspaceId);
  const workspace = await Workspace.findById(link.workspaceId).select("name kind").lean();
  if (!workspace) throw new Error("The workspace is gone");
  const workspaceName = workspace.kind === "personal" ? "Personal" : workspace.name;
  const today = now.toISOString().slice(0, 10);
  const through = addDays(today, link.daysAhead);
  const months = monthsToScan(today, through);

  const desired = new Map<string, DesiredTask>();
  for (const month of months) {
    const calendar = await getBillCalendar(userId, workspaceId, month);
    if (link.bills) for (const item of calendar.items) desired.set(...entry(billTask(item, formatMoney, workspaceName)));
    if (link.reminders) for (const marker of calendar.markers) desired.set(...entry(markerTask(marker, workspaceName)));
  }
  const records = await FlowTask.find({ linkId: link._id });
  const tracked: TrackedTask[] = records.map((r) => ({ key: r.key, flowTaskId: r.flowTaskId, dueDate: r.dueDate, state: r.state as TrackedTask["state"] }));
  const plan = planSync([...desired.values()], tracked, { scannedFrom: `${months[0]}-01`, today, through });

  const flow = flowClient(open(link.tokenSealed));
  const counts = { made: 0, completed: 0, moved: 0, canceled: 0 };
  // A task deleted in Flow is left alone from then on.
  const settle = async (key: string, run: () => Promise<unknown>, state: TrackedTask["state"], field: keyof typeof counts, set: Record<string, unknown> = {}) => {
    try {
      await run();
      counts[field] += 1;
      await FlowTask.updateOne({ linkId: link._id, key }, { $set: { state, ...set } });
    } catch (error) {
      if (error instanceof FlowError && error.status === 404) await FlowTask.updateOne({ linkId: link._id, key }, { $set: { state: "canceled" } });
      else throw error;
    }
  };
  for (const t of plan.complete) await settle(t.key, () => flow.updateTask(t.flowTaskId, { status: "done" }), "done", "completed");
  for (const t of plan.cancel) await settle(t.key, () => flow.updateTask(t.flowTaskId, { status: "canceled" }), "canceled", "canceled");
  for (const { task, dueDate } of plan.move) await settle(task.key, () => flow.updateTask(task.flowTaskId, { dueAt: flowDueAt(dueDate), dueHasTime: false }), "open", "moved", { dueDate });
  for (const d of plan.create.slice(0, MAX_CREATES)) {
    const task = await flow.createTask(link.flowWorkspaceId, {
      title: d.title,
      description: d.description,
      projectId: link.flowProjectId ?? null,
      priority: link.priority,
      dueAt: flowDueAt(d.dueDate),
      dueHasTime: false,
    });
    await FlowTask.create({ linkId: link._id, workspaceId: link.workspaceId, key: d.key, flowTaskId: task.id, dueDate: d.dueDate, state: "open" });
    counts.made += 1;
  }
  const more = plan.create.length > MAX_CREATES ? `, ${plan.create.length - MAX_CREATES} more tomorrow` : "";
  return `Made ${counts.made}, completed ${counts.completed}, moved ${counts.moved}, canceled ${counts.canceled}${more}`;
}

function entry(d: DesiredTask): [string, DesiredTask] {
  return [d.key, d];
}

/**
 * Runs one link if nothing else is; records how it went. A token Flow turns
 * down pauses the link and tells its owner, rather than failing every day.
 */
async function runLink(linkId: Types.ObjectId, now: Date) {
  const link = await FlowLink.findOneAndUpdate(
    { _id: linkId, $or: [{ syncLockUntil: null }, { syncLockUntil: { $lt: now } }] },
    { $set: { syncLockUntil: new Date(now.getTime() + LOCK_MS) } },
    { returnDocument: "after" },
  );
  if (!link) return null;
  let result: string;
  let ok = true;
  let pause = false;
  try {
    result = await syncLink(link, now);
  } catch (error) {
    ok = false;
    result = error instanceof Error ? error.message : "It didn't work";
    if (error instanceof FlowError && (error.status === 401 || error.status === 403)) pause = true;
    if (error instanceof ApiError && error.status === 403) {
      pause = true;
      result = "You're no longer in this workspace";
    }
  }
  await FlowLink.updateOne({ _id: link._id }, { $set: { lastSyncAt: now, lastResult: result, lastOk: ok, syncLockUntil: null, ...(pause ? { paused: true } : {}) } });
  if (pause) {
    await notifyUsers({ userIds: [String(link.userId)], workspaceId: String(link.workspaceId), kind: "report.failed", title: "Flow sync paused", body: `${result}. Relink Flow to start it again.`, href: "/settings/flow" });
  }
  return { ok, result };
}

/** Syncs your link now. */
export function syncFlowNow(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const doc = await FlowLink.findOne(own(userId, workspaceId)).select("_id").lean();
    if (!doc) throw new ApiError(404, "not_found", "Not linked to Flow");
    const ran = await runLink(doc._id, new Date());
    if (!ran) throw new ApiError(409, "conflict", "A sync is already running");
    const fresh = await FlowLink.findById(doc._id);
    return view(fresh!);
  });
}

/** The daily run: every link that isn't paused. */
export function runFlowSync(now = new Date()) {
  return withDb(async () => {
    if (!flowUrl()) return { flowLinksSynced: 0, flowLinksFailed: 0 };
    const links = await FlowLink.find({ paused: false }).select("_id").lean();
    let synced = 0;
    let failed = 0;
    for (const { _id } of links) {
      const ran = await runLink(_id, now);
      if (ran?.ok) synced += 1;
      else if (ran) failed += 1;
    }
    return { flowLinksSynced: synced, flowLinksFailed: failed };
  });
}
