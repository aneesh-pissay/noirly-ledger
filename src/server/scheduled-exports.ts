import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { BudgetPool, LedgerUser, ScheduledExport, Workspace, WorkspaceMember, type ScheduledExportDocument } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { buildExportFile } from "@/src/server/exports/build";
import { sendLedgerEmail } from "@/src/server/mail/send";
import { notifyUsers } from "@/src/server/notifications/notify";
import { isoDate } from "@/src/core/budgets/period";
import {
  coveredRange,
  describeSchedule,
  nextRunOn,
  runAfter,
  scheduleProblem,
  type ExportFormat,
  type ExportFrequency,
  type ScheduledExportBody,
  type ScheduledExportView,
} from "@/src/core/export-schedules";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

type ScheduledExportInput = ScheduledExportBody;

async function view(doc: ScheduledExportDocument): Promise<ScheduledExportView> {
  const users = await LedgerUser.find({ _id: { $in: doc.recipientIds } }).select("displayName").lean();
  return {
    id: String(doc._id),
    name: doc.name,
    format: doc.format as ExportFormat,
    template: doc.template as ScheduledExportInput["template"],
    budgetPoolId: doc.budgetPoolId ? String(doc.budgetPoolId) : null,
    frequency: doc.frequency as ExportFrequency,
    runDay: doc.runDay,
    recipientIds: doc.recipientIds.map(String),
    recipientNames: users.map((u) => u.displayName),
    schedule: describeSchedule({ frequency: doc.frequency as ExportFrequency, runDay: doc.runDay }),
    nextRunOn: doc.nextRunOn,
    paused: doc.paused,
    lastRunAt: doc.lastRunAt ? doc.lastRunAt.toISOString() : null,
    lastRange: doc.lastRange?.from && doc.lastRange.to ? { from: doc.lastRange.from, to: doc.lastRange.to } : null,
    lastSentTo: doc.lastSentTo,
    lastError: doc.lastError ?? null,
  };
}

/** Checks a schedule: a valid day, a pool in this workspace for pool reports, recipients who are members (each once). */
async function clean(workspaceId: Types.ObjectId, input: ScheduledExportInput) {
  const problem = scheduleProblem({ frequency: input.frequency, runDay: input.runDay });
  if (problem) throw new ApiError(400, "invalid_request", problem);
  if (input.template === "pool") {
    if (!input.budgetPoolId || !(await BudgetPool.exists({ _id: oid(input.budgetPoolId), workspaceId }))) {
      throw new ApiError(400, "invalid_request", "Pick a pool in this workspace");
    }
  }
  const ids = [...new Set(input.recipientIds)];
  const members = await WorkspaceMember.find({ workspaceId, userId: { $in: ids.map(oid) } }).select("userId").lean();
  // Reports only go to people who can already see the workspace.
  if (members.length !== ids.length) throw new ApiError(400, "invalid_request", "Reports can only go to members of this workspace");
  if (!ids.length) throw new ApiError(400, "invalid_request", "Pick who gets it");
  return {
    name: input.name.trim(),
    format: input.format,
    template: input.template,
    budgetPoolId: input.template === "pool" && input.budgetPoolId ? oid(input.budgetPoolId) : null,
    frequency: input.frequency,
    runDay: input.runDay,
    recipientIds: ids.map(oid),
  };
}

export function listScheduledExports(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await ScheduledExport.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: 1 });
    return { schedules: await Promise.all(docs.map(view)) };
  });
}

/** Anyone who can export reports can schedule them. */
export function createScheduledExport(userId: string, workspaceId: string, input: ScheduledExportInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "report.export");
    const ws = oid(workspaceId);
    const fields = await clean(ws, input);
    const doc = await ScheduledExport.create({ workspaceId: ws, createdById: oid(userId), ...fields, nextRunOn: nextRunOn(fields, isoDate(new Date())) });
    return view(doc);
  });
}

export function updateScheduledExport(userId: string, workspaceId: string, id: string, input: ScheduledExportInput & { paused?: boolean }) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "report.export");
    const ws = oid(workspaceId);
    const doc = await ScheduledExport.findOne({ _id: oid(id), workspaceId: ws });
    if (!doc) throw new ApiError(404, "not_found", "Schedule not found");
    const fields = await clean(ws, input);
    const timing = fields.frequency !== doc.frequency || fields.runDay !== doc.runDay;
    doc.set(fields);
    if (input.paused !== undefined) doc.paused = input.paused;
    if (timing) doc.nextRunOn = nextRunOn(fields, isoDate(new Date()));
    await doc.save();
    return view(doc);
  });
}

export function deleteScheduledExport(userId: string, workspaceId: string, id: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "report.export");
    const res = await ScheduledExport.deleteOne({ _id: oid(id), workspaceId: oid(workspaceId) });
    if (!res.deletedCount) throw new ApiError(404, "not_found", "Schedule not found");
  });
}

/**
 * Builds the report a run on `runOn` covers and emails it to each
 * recipient still in the workspace. Records how it went on the schedule.
 */
async function deliver(doc: ScheduledExportDocument, runOn: string) {
  const range = coveredRange(doc.frequency as ExportFrequency, runOn);
  const workspace = await Workspace.findById(doc.workspaceId).select("name baseCurrency").lean();
  if (!workspace) return { sentTo: 0, error: "The workspace is gone", range };
  const stillMembers = await WorkspaceMember.find({ workspaceId: doc.workspaceId, userId: { $in: doc.recipientIds } }).select("userId").lean();
  const recipients = await LedgerUser.find({ _id: { $in: stillMembers.map((m) => m.userId) } }).select("email").lean();
  const emails = recipients.map((r) => r.email).filter((e): e is string => Boolean(e));
  if (!emails.length) return { sentTo: 0, error: "Nobody to send it to: its recipients have left the workspace", range };
  const file = await buildExportFile(
    { workspaceId: String(doc.workspaceId), from: range.from, to: range.to, template: doc.template as ScheduledExportInput["template"], budgetPoolId: doc.budgetPoolId ? String(doc.budgetPoolId) : null },
    doc.format as ExportFormat,
    workspace.name,
    workspace.baseCurrency,
  );
  let sentTo = 0;
  for (const to of emails) {
    const ok = await sendLedgerEmail({
      to,
      subject: `${doc.name}: ${workspace.name}, ${range.from} to ${range.to}`,
      text: `Your scheduled Noirly Ledger report "${doc.name}" for ${workspace.name}, covering ${range.from} to ${range.to}, is attached (${file.filename}).\n\n${describeSchedule({ frequency: doc.frequency as ExportFrequency, runDay: doc.runDay })}. Change or stop it on the workspace's Reports page, under Export.`,
      attachments: [file],
    });
    if (ok) sentTo += 1;
  }
  return { sentTo, error: sentTo ? null : "Email isn't working: nothing was sent", range };
}

function record(doc: ScheduledExportDocument, result: Awaited<ReturnType<typeof deliver>>) {
  doc.lastRunAt = new Date();
  doc.lastRange = result.range;
  doc.lastSentTo = result.sentTo;
  doc.lastError = result.error;
}

/** Sends a schedule's report now, for the period its next run would cover; the schedule itself doesn't move. */
export function sendScheduledExportNow(userId: string, workspaceId: string, id: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "report.export");
    const doc = await ScheduledExport.findOne({ _id: oid(id), workspaceId: oid(workspaceId) });
    if (!doc) throw new ApiError(404, "not_found", "Schedule not found");
    const result = await deliver(doc, isoDate(new Date()));
    record(doc, result);
    await doc.save();
    if (result.error) throw new ApiError(502, "not_sent", result.error);
    return view(doc);
  });
}

/**
 * The daily run: every schedule due today or earlier is sent once (a
 * missed day sends once, not once per missed day) and moves to its next
 * date. A failed send tells whoever set it up.
 */
export function runScheduledExports(now = new Date()) {
  return withDb(async () => {
    const today = isoDate(now);
    const due = await ScheduledExport.find({ paused: false, nextRunOn: { $lte: today } });
    let sent = 0;
    let failed = 0;
    for (const doc of due) {
      // Claim it first, so two runs at once don't both send it.
      const next = runAfter({ frequency: doc.frequency as ExportFrequency, runDay: doc.runDay }, today);
      const claimed = await ScheduledExport.updateOne({ _id: doc._id, nextRunOn: doc.nextRunOn }, { $set: { nextRunOn: next } });
      if (!claimed.modifiedCount) continue;
      let result: Awaited<ReturnType<typeof deliver>>;
      try {
        result = await deliver(doc, today);
      } catch (error) {
        console.error("scheduled export failed", error);
        result = { sentTo: 0, error: "The report couldn't be built", range: coveredRange(doc.frequency as ExportFrequency, today) };
      }
      record(doc, result);
      doc.nextRunOn = next;
      await doc.save();
      if (result.error) {
        failed += 1;
        await notifyUsers({
          userIds: [String(doc.createdById)],
          workspaceId: String(doc.workspaceId),
          kind: "report.failed",
          title: `"${doc.name}" wasn't sent`,
          body: result.error,
          href: null,
        });
      } else sent += 1;
    }
    return { exportsSent: sent, exportsFailed: failed };
  });
}
