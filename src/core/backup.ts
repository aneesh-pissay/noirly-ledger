/**
 * A workspace's full export: everything in it as one JSON document, to keep
 * or to move elsewhere, and the same document stored on a schedule as a
 * backup (gzipped and sealed). Left out on purpose: secrets (webhook signing
 * secrets, tokens, the email address's secret, sealed account numbers) and
 * receipt files themselves, which are listed by name.
 */

export const EXPORT_FORMAT = "noirly-ledger-export";
export const EXPORT_VERSION = 1;
/** Above this many transactions an export is refused rather than built in one go. */
export const MAX_EXPORT_TRANSACTIONS = 200_000;

export const BACKUP_FREQUENCIES = ["daily", "weekly"] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];
/** Backups kept per workspace; the oldest goes as a new one lands. */
export const KEEP_BACKUPS = 5;
/** A little under the period, so a daily run that's a little late still keeps up. */
const DUE_AFTER_MS: Record<BackupFrequency, number> = { daily: 20 * 3_600_000, weekly: 6.5 * 86_400_000 };

export function isBackupDue(frequency: BackupFrequency, lastRunAt: Date | null, now: Date) {
  return !lastRunAt || now.getTime() - lastRunAt.getTime() >= DUE_AFTER_MS[frequency];
}

/** Fields that never leave: secrets, and what's only there to find things by. */
export const DROPPED_KEYS = new Set(["__v", "secret", "tokenHash", "tokenSealed", "numberSealed", "noteTerms", "localPart", "syncLockUntil", "passwordHash"]);

/**
 * A stored document as it goes in the export: ids and dates as strings, the
 * dropped keys left out, and sealed text opened (by `open`), however deep.
 */
export function exportValue(value: unknown, open: (sealed: string) => unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.startsWith("enc1:") ? open(value) : value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => exportValue(v, open));
  if (typeof value === "object") {
    const record = value as Record<string, unknown> & { toHexString?: () => string };
    if (typeof record.toHexString === "function") return record.toHexString();
    if (record._bsontype === "Decimal128" || record._bsontype === "Long") return String(value);
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(record)) {
      if (DROPPED_KEYS.has(key)) continue;
      out[key === "_id" ? "id" : key] = exportValue(v, open);
    }
    return out;
  }
  return value;
}

/** "Team Alpha" → "team-alpha", for file names. */
export function fileSlug(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}

// ── Restore ───────────────────────────────────────────────────────────────

/**
 * Collections a restore leaves out: the audit history (its chain is the
 * old workspace's; the new one starts its own), webhooks (their secrets
 * aren't in the export), and the receipt inbox (its files aren't either).
 */
export const RESTORE_SKIPPED = new Set(["auditEntries", "webhooks", "receiptInbox"]);
/** An upload larger than this is refused (gzipped or not). */
export const MAX_RESTORE_BYTES = 50 * 1_048_576;

export type ExportDocument = {
  format: string;
  version: number;
  exportedAt: string;
  workspace: Record<string, unknown>;
  members?: unknown[];
  counts: Record<string, number>;
} & Record<string, unknown>;

/** Checks a parsed file is one of Ledger's exports, in a version this build reads. */
export function checkExport(value: unknown): { ok: true; data: ExportDocument } | { ok: false; error: string } {
  const doc = value as Partial<ExportDocument> | null;
  if (!doc || typeof doc !== "object" || doc.format !== EXPORT_FORMAT) return { ok: false, error: "This isn't a Noirly Ledger export or backup" };
  if (doc.version !== EXPORT_VERSION) return { ok: false, error: `This export is version ${String(doc.version)}; this Ledger reads version ${EXPORT_VERSION}` };
  if (!doc.workspace || typeof doc.workspace !== "object" || typeof doc.workspace.id !== "string") return { ok: false, error: "The export has no workspace in it" };
  if (!doc.counts || typeof doc.counts !== "object") return { ok: false, error: "The export has no counts in it" };
  for (const [name, count] of Object.entries(doc.counts)) {
    const rows = (doc as Record<string, unknown>)[name];
    if (!Array.isArray(rows) || rows.length !== count) return { ok: false, error: `The export looks cut short: ${name} doesn't match its count` };
  }
  return { ok: true, data: doc as ExportDocument };
}

/** The ids of every record in the export (and the workspace), each paired with a fresh one from `newId`. */
export function idMapFor(data: ExportDocument, newId: () => string) {
  const map = new Map<string, string>([[String(data.workspace.id), newId()]]);
  for (const name of Object.keys(data.counts)) {
    for (const row of data[name] as Array<{ id?: unknown }>) if (typeof row?.id === "string") map.set(row.id, newId());
  }
  return map;
}

/**
 * An exported record made ready to store again: "id" back to "_id", and
 * every id that points inside the export swapped for its new one, however
 * deep. Ids that point outside it (people) are kept.
 */
export function restoreValue(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === "string") return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => restoreValue(v, ids));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) out[key === "id" ? "_id" : key] = restoreValue(v, ids);
    return out;
  }
  return value;
}

export type RestoreResult = { workspaceId: string; name: string; counts: Record<string, number>; skipped: string[]; membersLeftOut: number };

export type BackupView ={ id: string; createdAt: string; sizeBytes: number; transactionCount: number; trigger: "scheduled" | "manual" };
export type BackupSettings = { available: boolean; enabled: boolean; frequency: BackupFrequency; lastRunAt: string | null; backups: BackupView[] };
