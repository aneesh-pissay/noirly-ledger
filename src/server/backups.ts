import { gunzipSync, gzipSync } from "node:zlib";
import { Types, type Model } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import * as M from "@/src/server/models";
import { requireAction } from "@/src/server/workspace/members";
import { openField, sealField } from "@/src/server/security/field-crypto";
import { open, seal } from "@/src/server/security/secret-box";
import { putBackup, readBackupObject, removeBackupObject, type StoredObject } from "@/src/server/storage/backups";
import { appendAudit } from "@/src/server/audit";
import { SEALED_FIELDS } from "@/src/server/transaction-activity";
import type { WorkspaceDocument } from "@/src/server/models/Workspace";
import type { WorkspacePurpose } from "@/src/core/workspace-purpose";
import {
  checkExport, EXPORT_FORMAT, EXPORT_VERSION, exportValue, fileSlug, idMapFor, isBackupDue, KEEP_BACKUPS, MAX_EXPORT_TRANSACTIONS, MAX_RESTORE_BYTES, RESTORE_SKIPPED, restoreValue,
  type BackupFrequency, type BackupSettings, type BackupView, type ExportDocument, type RestoreResult,
} from "@/src/core/backup";

const oid = (id: string | Types.ObjectId) => {
  if (!Types.ObjectId.isValid(String(id))) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(String(id));
};
/** "Back up now" at most this often. */
const MANUAL_GAP_MS = 10 * 60_000;
const CRON_BATCH = 20;

/**
 * What a workspace's export holds, collection by collection: everything
 * kept against the workspace, but not one person's own settings (their
 * notifications, tokens, Flow link, calendar link), nor the logs of things
 * sent (webhook deliveries, workflow runs, emails received, reminders).
 */
const COLLECTIONS: Array<[string, Model<never>]> = ([
  ["categories", M.Category],
  ["accounts", M.Account],
  ["reconciliations", M.Reconciliation],
  ["transactions", M.Transaction],
  ["transactionComments", M.TransactionComment],
  ["transactionChanges", M.TransactionChange],
  ["transactionViews", M.TransactionView],
  ["transactionRules", M.TransactionRule],
  ["receiptInbox", M.ReceiptInbox],
  ["importBatches", M.ImportBatch],
  ["budgets", M.Budget],
  ["budgetRevisions", M.BudgetRevision],
  ["budgetPlans", M.BudgetPlan],
  ["budgetTemplates", M.BudgetTemplate],
  ["envelopeMoves", M.EnvelopeMove],
  ["scenarios", M.Scenario],
  ["budgetPools", M.BudgetPool],
  ["poolContributions", M.PoolContribution],
  ["savingsGoals", M.SavingsGoal],
  ["goalContributions", M.GoalContribution],
  ["sinkingFunds", M.SinkingFund],
  ["scheduledPayments", M.ScheduledPayment],
  ["loanPlans", M.LoanPlan],
  ["installmentPlans", M.InstallmentPlan],
  ["debtSettings", M.DebtSettings],
  ["subscriptionDismissals", M.SubscriptionDismissal],
  ["approvalRequests", M.ApprovalRequest],
  ["approvalRules", M.ApprovalRule],
  ["approvalDelegations", M.ApprovalDelegation],
  ["approvalEvents", M.ApprovalEvent],
  ["spendingPolicies", M.SpendingPolicy],
  ["reimbursements", M.Reimbursement],
  ["payouts", M.Payout],
  ["departments", M.Department],
  ["projects", M.Project],
  ["fxRates", M.FxRate],
  ["workspaceRoles", M.WorkspaceRole],
  ["workflows", M.Workflow],
  ["automations", M.Automation],
  ["scheduledExports", M.ScheduledExport],
  ["dashboardLayouts", M.DashboardLayout],
  ["webhooks", M.Webhook],
  ["auditEntries", M.AuditEntry],
] as Array<[string, unknown]>).filter(([, model]) => (model as Model<never>).schema.path("workspaceId")) as Array<[string, Model<never>]>;

const asExport = (value: unknown) => exportValue(value, (sealed) => openField(sealed));

/**
 * Everything in a workspace as one JSON document. Notes come out as text;
 * secrets (webhook secrets, sealed account numbers) and receipt files don't.
 */
export async function buildWorkspaceExport(workspaceId: string) {
  return withDb(async () => {
    const ws = oid(workspaceId);
    const workspace = await M.Workspace.findById(ws).lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const count = await M.Transaction.countDocuments({ workspaceId: ws });
    if (count > MAX_EXPORT_TRANSACTIONS) throw new ApiError(413, "too_large", `This workspace has ${count} transactions; exports go up to ${MAX_EXPORT_TRANSACTIONS}.`);
    const memberships = await M.WorkspaceMember.find({ workspaceId: ws }).lean();
    const users = await M.LedgerUser.find({ _id: { $in: memberships.map((m) => m.userId) } }).select("displayName email").lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const data: Record<string, unknown> = {};
    for (const [name, model] of COLLECTIONS) {
      data[name] = asExport(await model.find({ workspaceId: ws } as never).sort({ _id: 1 }).lean());
    }
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      workspace: asExport(workspace) as Record<string, unknown>,
      members: memberships.map((m) => ({
        userId: String(m.userId),
        displayName: userById.get(String(m.userId))?.displayName ?? null,
        email: userById.get(String(m.userId))?.email ?? null,
        role: m.role,
        customRoleId: m.customRoleId ? String(m.customRoleId) : null,
      })),
      counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (v as unknown[]).length])),
      ...data,
    };
  });
}

/** The full export, for those who run the workspace (it lists members' emails). Recorded in the audit history. */
export async function exportWorkspaceJson(userId: string, workspaceId: string) {
  await withDb(() => requireAction(userId, workspaceId, "workspace.manage"));
  const data = await buildWorkspaceExport(workspaceId);
  await appendAudit({ workspaceId, actorId: userId, action: "workspace.exported", entity: "workspace", entityId: workspaceId, summary: "Full export downloaded", data: { counts: data.counts } });
  return data;
}

// ── Backups ───────────────────────────────────────────────────────────────

function view(doc: { _id: Types.ObjectId; createdAt: Date; sizeBytes: number; transactionCount: number; trigger: string }): BackupView {
  return { id: String(doc._id), createdAt: doc.createdAt.toISOString(), sizeBytes: doc.sizeBytes, transactionCount: doc.transactionCount, trigger: doc.trigger as BackupView["trigger"] };
}

/** Gzipped, then sealed with Ledger's key, so the store never holds it readable. */
function pack(data: unknown) {
  return Buffer.from(seal(gzipSync(Buffer.from(JSON.stringify(data))).toString("base64")), "utf8");
}

function unpack(body: Buffer) {
  return gunzipSync(Buffer.from(open(body.toString("utf8")), "base64"));
}

/** Makes one backup, then removes the oldest past KEEP_BACKUPS. */
async function runBackup(workspaceId: string, trigger: "scheduled" | "manual", userId: string | null) {
  const data = await buildWorkspaceExport(workspaceId);
  const body = pack(data);
  const object = await putBackup(workspaceId, body);
  const doc = await M.WorkspaceBackup.create({
    workspaceId: oid(workspaceId),
    ...object,
    sizeBytes: body.length,
    transactionCount: data.counts.transactions ?? 0,
    trigger,
    createdById: userId ? oid(userId) : null,
  });
  await M.Workspace.updateOne({ _id: oid(workspaceId) }, { $set: { "backup.lastRunAt": new Date() } });
  const old = await M.WorkspaceBackup.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: -1 }).skip(KEEP_BACKUPS).lean();
  for (const backup of old) {
    await removeBackupObject({ storage: backup.storage as StoredObject["storage"], key: backup.key });
    await M.WorkspaceBackup.deleteOne({ _id: backup._id });
  }
  return view(doc.toObject());
}

export function getBackupSettings(userId: string, workspaceId: string) {
  return withDb(async (): Promise<BackupSettings> => {
    await requireAction(userId, workspaceId, "workspace.manage");
    const workspace = await M.Workspace.findById(oid(workspaceId)).select("backup").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const backups = await M.WorkspaceBackup.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: -1 }).limit(KEEP_BACKUPS).lean();
    return {
      available: true,
      enabled: Boolean(workspace.backup?.enabled),
      frequency: (workspace.backup?.frequency ?? "weekly") as BackupFrequency,
      lastRunAt: workspace.backup?.lastRunAt ? workspace.backup.lastRunAt.toISOString() : null,
      backups: backups.map(view),
    };
  });
}

export async function setBackupSchedule(userId: string, workspaceId: string, input: { enabled: boolean; frequency: BackupFrequency }) {
  await withDb(async () => {
    await requireAction(userId, workspaceId, "workspace.manage");
    await M.Workspace.updateOne({ _id: oid(workspaceId) }, { $set: { "backup.enabled": input.enabled, "backup.frequency": input.frequency } });
  });
  return getBackupSettings(userId, workspaceId);
}

export function backUpNow(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "workspace.manage");
    const latest = await M.WorkspaceBackup.findOne({ workspaceId: oid(workspaceId), trigger: "manual" }).sort({ createdAt: -1 }).select("createdAt").lean();
    if (latest && Date.now() - latest.createdAt.getTime() < MANUAL_GAP_MS) {
      throw new ApiError(429, "rate_limited", "A backup was just made. Try again in a few minutes.");
    }
    return runBackup(workspaceId, "manual", userId);
  });
}

/** A backup as its JSON (gzipped), opened for whoever runs the workspace to download. Recorded in the audit history. */
export function readBackup(userId: string, workspaceId: string, backupId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "workspace.manage");
    const backup = await M.WorkspaceBackup.findOne({ _id: oid(backupId), workspaceId: oid(workspaceId) }).lean();
    if (!backup) throw new ApiError(404, "not_found", "Backup not found");
    let json: Buffer;
    try {
      json = unpack(await readBackupObject({ storage: backup.storage as StoredObject["storage"], key: backup.key }));
    } catch {
      throw new ApiError(410, "unreadable", "This backup can't be read: its file is gone, or Ledger's key changed since it was made");
    }
    const workspace = await M.Workspace.findById(oid(workspaceId)).select("name").lean();
    await appendAudit({ workspaceId, actorId: userId, action: "workspace.backup_downloaded", entity: "workspace", entityId: workspaceId, summary: `Backup from ${backup.createdAt.toISOString().slice(0, 10)} downloaded`, data: { backupId: String(backup._id) } });
    return { body: gzipSync(json), createdAt: backup.createdAt, name: workspace?.name ?? "workspace" };
  });
}

/** For the daily run: backs up the workspaces that are due, longest-waiting first, a batch at a time. */
export function runDueBackups(limit = CRON_BATCH, now = new Date()) {
  return withDb(async () => {
    const candidates = await M.Workspace.find({ "backup.enabled": true }).select("backup").sort({ "backup.lastRunAt": 1 }).limit(limit * 5).lean();
    const due = candidates.filter((w) => isBackupDue((w.backup?.frequency ?? "weekly") as BackupFrequency, w.backup?.lastRunAt ?? null, now)).slice(0, limit);
    let made = 0;
    for (const workspace of due) {
      try {
        await runBackup(String(workspace._id), "scheduled", null);
        made += 1;
      } catch (error) {
        console.error("Scheduled backup failed; it will be tried on the next run.", error instanceof Error ? error.message : error);
      }
    }
    return { backupsDue: due.length, backupsMade: made };
  });
}

// ── Restore ───────────────────────────────────────────────────────────────

const INSERT_CHUNK = 1_000;

/** What a restored record gives up: files and secrets that stayed behind, and anything that would reach outside the workspace on its own. */
function prepare(collection: string, row: Record<string, unknown>) {
  switch (collection) {
    case "transactions":
      // Receipt files belong to the old workspace; deleting this one mustn't take them.
      return { ...row, receiptStorageKey: null, attachments: [] };
    case "accounts":
      return { ...row, numberLast4: null };
    case "transactionChanges":
      return { ...row, changes: ((row.changes ?? []) as Array<{ field: string; from: unknown; to: unknown }>).map((ch) => (SEALED_FIELDS.has(ch.field) ? { ...ch, from: sealField(ch.from as string | null), to: sealField(ch.to as string | null) } : ch)) };
    case "scheduledExports":
    case "automations":
      // They email and act on a schedule: paused until someone turns them back on.
      return { ...row, paused: true };
    default:
      return row;
  }
}

async function freeSlug(name: string) {
  const base = fileSlug(name).slice(0, 40);
  let slug = base;
  for (let n = 1; await M.Workspace.exists({ slug }); n += 1) slug = `${base}-${n}`;
  return slug;
}

/**
 * Restores an export as a new shared workspace, owned by `userId` alone:
 * every record gets a new id, so the original (if it's still there) is
 * untouched. Members aren't added back; they're invited again. If any part
 * fails, what was restored so far is removed.
 */
async function restoreExport(userId: string, data: ExportDocument, source: string): Promise<RestoreResult> {
  if ((data.counts.transactions ?? 0) > MAX_EXPORT_TRANSACTIONS) throw new ApiError(413, "too_large", `Restores go up to ${MAX_EXPORT_TRANSACTIONS} transactions`);
  const ids = idMapFor(data, () => new Types.ObjectId().toHexString());
  const workspaceId = new Types.ObjectId(ids.get(String(data.workspace.id)));
  const old = data.workspace as {
    kind?: string; name?: string; baseCurrency?: string; fiscalYearStartMonth?: number | null; purpose?: WorkspacePurpose;
    envelopesSince?: string | null; autoFxRates?: boolean; approvalDeadlines?: WorkspaceDocument["approvalDeadlines"];
  };
  const name = `${old.kind === "personal" ? "Personal" : (old.name ?? "Workspace")} (restored)`.slice(0, 80);
  await M.Workspace.create({
    _id: workspaceId,
    kind: "team",
    name,
    slug: await freeSlug(name),
    ownerUserId: oid(userId),
    baseCurrency: old.baseCurrency ?? "USD",
    fiscalYearStartMonth: old.fiscalYearStartMonth ?? null,
    purpose: old.purpose ?? "team",
    envelopesSince: old.envelopesSince ? new Date(old.envelopesSince) : null,
    autoFxRates: Boolean(old.autoFxRates),
    approvalDeadlines: old.approvalDeadlines ?? null,
  });
  await M.WorkspaceMember.create({ workspaceId, userId: oid(userId), role: "owner" });

  const counts: Record<string, number> = {};
  try {
    for (const [collection, model] of COLLECTIONS) {
      if (RESTORE_SKIPPED.has(collection)) continue;
      const rows = (data[collection] ?? []) as unknown[];
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const docs = rows.slice(i, i + INSERT_CHUNK).map((row) => prepare(collection, restoreValue(row, ids) as Record<string, unknown>));
        await model.insertMany(docs as never[]);
      }
      if (rows.length) counts[collection] = rows.length;
    }
  } catch (error) {
    const { purgeWorkspace } = await import("@/src/server/workspace/purge");
    await purgeWorkspace(workspaceId);
    console.error("Restore failed; what was restored was removed.", error instanceof Error ? error.message : error);
    throw new ApiError(422, "restore_failed", `The backup couldn't be restored: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}. Nothing was kept.`);
  }

  const skipped = [...RESTORE_SKIPPED].filter((c) => (data.counts[c] ?? 0) > 0);
  const membersLeftOut = Math.max(0, (data.members?.length ?? 0) - 1);
  await appendAudit({
    workspaceId,
    actorId: userId,
    action: "workspace.restored",
    entity: "workspace",
    entityId: workspaceId,
    summary: `Restored from ${source}`,
    data: { from: String(data.workspace.id), exportedAt: data.exportedAt, counts },
  });
  return { workspaceId: String(workspaceId), name, counts, skipped, membersLeftOut };
}

/** Restores one of a workspace's stored backups as a new workspace. Takes running the workspace it's from. */
export function restoreBackup(userId: string, workspaceId: string, backupId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "workspace.manage");
    const backup = await M.WorkspaceBackup.findOne({ _id: oid(backupId), workspaceId: oid(workspaceId) }).lean();
    if (!backup) throw new ApiError(404, "not_found", "Backup not found");
    let parsed: unknown;
    try {
      parsed = JSON.parse(unpack(await readBackupObject({ storage: backup.storage as StoredObject["storage"], key: backup.key })).toString("utf8"));
    } catch {
      throw new ApiError(410, "unreadable", "This backup can't be read: its file is gone, or Ledger's key changed since it was made");
    }
    const checked = checkExport(parsed);
    if (!checked.ok) throw new ApiError(422, "invalid_backup", checked.error);
    const made = backup.createdAt.toISOString().slice(0, 10);
    const result = await restoreExport(userId, checked.data, `the backup of ${made}`);
    await appendAudit({ workspaceId, actorId: userId, action: "workspace.backup_restored", entity: "workspace", entityId: workspaceId, summary: `Backup from ${made} restored as "${result.name}"`, data: { backupId: String(backup._id), restoredTo: result.workspaceId } });
    return result;
  });
}

/** Restores an uploaded export or backup file (JSON, or the .json.gz a backup downloads as) as a new workspace of the uploader's. */
export function restoreUpload(userId: string, body: Buffer) {
  return withDb(async () => {
    if (body.length > MAX_RESTORE_BYTES) throw new ApiError(413, "too_large", `Files go up to ${MAX_RESTORE_BYTES / 1_048_576} MB`);
    let parsed: unknown;
    try {
      const gzipped = body[0] === 0x1f && body[1] === 0x8b;
      parsed = JSON.parse((gzipped ? gunzipSync(body, { maxOutputLength: MAX_RESTORE_BYTES * 10 }) : body).toString("utf8"));
    } catch {
      throw new ApiError(422, "invalid_backup", "The file can't be read as an export: it should be the .json or .json.gz Ledger gave you");
    }
    const checked = checkExport(parsed);
    if (!checked.ok) throw new ApiError(422, "invalid_backup", checked.error);
    return restoreExport(userId, checked.data, `an uploaded export of ${checked.data.exportedAt.slice(0, 10)}`);
  });
}

/** When a workspace's data is deleted: its backup files too. */
export async function removeWorkspaceBackups(workspaceId: Types.ObjectId) {
  const backups = await M.WorkspaceBackup.find({ workspaceId }).lean();
  for (const backup of backups) await removeBackupObject({ storage: backup.storage as StoredObject["storage"], key: backup.key });
  await M.WorkspaceBackup.deleteMany({ workspaceId });
}
